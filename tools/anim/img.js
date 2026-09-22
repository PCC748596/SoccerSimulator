/*
Le um PNG, amplia-o e desenha por cima: grelha com coordenadas, ou um
esqueleto de linhas e circulos nas juncoes. Sem dependencias.
*/
const fs = require('fs'), zlib = require('zlib');

function lerPNG(f) {
    const b = fs.readFileSync(f);
    let i = 8, W = 0, H = 0, prof = 0, tipo = 0, dados = [];
    while (i < b.length) {
        const n = b.readUInt32BE(i), t = b.toString('ascii', i + 4, i + 8);
        const d = b.slice(i + 8, i + 8 + n);
        if (t === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); prof = d[8]; tipo = d[9]; }
        else if (t === 'IDAT') dados.push(d);
        else if (t === 'IEND') break;
        i += 12 + n;
    }
    if (prof !== 8) throw new Error('so 8 bits por canal, veio ' + prof);
    const canais = { 0: 1, 2: 3, 4: 2, 6: 4 }[tipo];
    if (!canais) throw new Error('tipo de cor ' + tipo + ' nao suportado');
    const bruto = zlib.inflateSync(Buffer.concat(dados));
    const bpp = canais, passo = W * bpp;
    const out = Buffer.alloc(W * H * 3);
    let ant = Buffer.alloc(passo), p = 0;
    for (let y = 0; y < H; y++) {
        const filtro = bruto[p++];
        const lin = Buffer.from(bruto.slice(p, p + passo)); p += passo;
        for (let x = 0; x < passo; x++) {
            const a = x >= bpp ? lin[x - bpp] : 0, c = x >= bpp ? ant[x - bpp] : 0, u = ant[x];
            let v = lin[x];
            if (filtro === 1) v += a; else if (filtro === 2) v += u;
            else if (filtro === 3) v += (a + u) >> 1;
            else if (filtro === 4) { const pa = Math.abs(u - c), pb = Math.abs(a - c), pc = Math.abs(a + u - 2 * c);
                v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? u : c); }
            lin[x] = v & 255;
        }
        ant = lin;
        for (let x = 0; x < W; x++) {
            const s = x * bpp, d = (y * W + x) * 3;
            if (canais >= 3) { out[d] = lin[s]; out[d + 1] = lin[s + 1]; out[d + 2] = lin[s + 2]; }
            else { out[d] = out[d + 1] = out[d + 2] = lin[s]; }
        }
    }
    return { W, H, px: out };
}

function escreverPNG(W, H, px, ficheiro) {
    const bruto = Buffer.alloc(H * (W * 3 + 1));
    for (let y = 0; y < H; y++) { bruto[y * (W * 3 + 1)] = 0; px.copy(bruto, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
    const cr = (t) => { let c = ~0; for (const b of t) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return (~c) >>> 0; };
    const bloco = (tipo, d) => { const t = Buffer.concat([Buffer.from(tipo), d]);
        const n = Buffer.alloc(4); n.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(cr(t));
        return Buffer.concat([n, t, c]); };
    const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
    fs.writeFileSync(ficheiro, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        bloco('IHDR', ih), bloco('IDAT', zlib.deflateSync(bruto)), bloco('IEND', Buffer.alloc(0))]));
}

const ampliar = (im, k) => {
    const W = im.W * k, H = im.H * k, px = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const s = ((y / k | 0) * im.W + (x / k | 0)) * 3, d = (y * W + x) * 3;
        px[d] = im.px[s]; px[d + 1] = im.px[s + 1]; px[d + 2] = im.px[s + 2];
    }
    return { W, H, px };
};
const pon = (im, x, y, c) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= im.W || y >= im.H) return;
    const i = (y * im.W + x) * 3; im.px[i] = c[0]; im.px[i + 1] = c[1]; im.px[i + 2] = c[2]; };
const linha = (im, x0, y0, x1, y1, c, esp = 1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (let s = 0; s <= n; s++) { const t = s / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        for (let dx = -esp; dx <= esp; dx++) for (let dy = -esp; dy <= esp; dy++) pon(im, x + dx, y + dy, c); } };
const circulo = (im, cx, cy, r, c, cheio) => {
    for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
        const d = Math.hypot(x, y); if (cheio ? d <= r : (d <= r && d >= r - 1.6)) pon(im, cx + x, cy + y, c); } };

module.exports = { lerPNG, escreverPNG, ampliar, pon, linha, circulo };

if (require.main === module) {
    const [, , modo, entrada, saida, k] = process.argv;
    const im = ampliar(lerPNG(entrada), +(k || 3));
    if (modo === 'grelha') {
        const passo = 20 * (+(k || 3));
        for (let x = 0; x < im.W; x += passo) for (let y = 0; y < im.H; y++) pon(im, x, y, [255, 0, 0]);
        for (let y = 0; y < im.H; y += passo) for (let x = 0; x < im.W; x++) pon(im, x, y, [255, 0, 0]);
        // marcas de 100 unidades originais: risco mais grosso
        const p100 = 100 * (+(k || 3));
        for (let x = 0; x < im.W; x += p100) for (let y = 0; y < im.H; y++) { pon(im, x, y, [0, 255, 255]); pon(im, x + 1, y, [0, 255, 255]); }
        for (let y = 0; y < im.H; y += p100) for (let x = 0; x < im.W; x++) { pon(im, x, y, [0, 255, 255]); pon(im, x, y + 1, [0, 255, 255]); }
        console.log(`grelha: vermelho de 20 em 20, ciano de 100 em 100 (coordenadas da imagem ORIGINAL ${im.W / (+(k || 3))}x${im.H / (+(k || 3))})`);
    }
    escreverPNG(im.W, im.H, im.px, saida);
}
