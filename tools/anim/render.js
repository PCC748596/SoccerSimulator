/*
Desenha o boneco em PNG, sem WebGL: projecta as caixas do rig com a camara do
editor e pinta as faces por ordem de profundidade. Serve para OLHAR para a
pose em vez de a deduzir de numeros.
*/
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const THREE = require('Z:/OneDrive_LEVU_TEMP/SoccerSimulator/node_modules/three');
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const raiz = 'Z:/OneDrive_LEVU_TEMP/SoccerSimulator';
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8').split(CR + LF).join(LF);
const ctx2d = new Proxy({}, { get: () => () => { }, set: () => true });
const doc = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const amb = { THREE, console, document: doc, window: {} };
const mod = new Function(...Object.keys(amb),
    `${ler('js/utils.js')}\n${ler('js/config/physics.js')}\n${ler('js/config/animations.js')}\n${ler('js/config/gait.js')}\n${ler('js/config/player_behavior.js')}
     ${ler('js/pose.js')}
     return { construirCorpo, escolherAparencia, aplicarPoseGoalKick, aplicarPosePlayerKick,
              GoalKickClip, PlayerKickClip, ALTURA_BASE_Y };`)(...Object.values(amb));

const W = 340, H = 460;

/* ---- tela ---- */
function tela() { const p = Buffer.alloc(W * H * 3); p.fill(16); return p; }
function pixel(p, x, y, c) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3; p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2];
}
// Poligono convexo cheio, por varrimento de linhas.
function poligono(p, pts, c) {
    let yMin = 1e9, yMax = -1e9;
    for (const q of pts) { if (q.y < yMin) yMin = q.y; if (q.y > yMax) yMax = q.y; }
    for (let y = Math.max(0, Math.floor(yMin)); y <= Math.min(H - 1, Math.ceil(yMax)); y++) {
        const xs = [];
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x));
        }
        if (xs.length < 2) continue;
        xs.sort((u, v) => u - v);
        for (let k = 0; k + 1 < xs.length; k += 2)
            for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) pixel(p, x, y, c);
    }
}
function linhaH(p, y, c) { for (let x = 0; x < W; x++) pixel(p, x, y, c); }

function png(p, ficheiro) {
    const bruto = Buffer.alloc(H * (W * 3 + 1));
    for (let y = 0; y < H; y++) { bruto[y * (W * 3 + 1)] = 0; p.copy(bruto, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
    const cr = (t) => { let c = ~0; for (const b of t) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return (~c) >>> 0; };
    const bloco = (tipo, dados) => { const t = Buffer.concat([Buffer.from(tipo), dados]);
        const n = Buffer.alloc(4); n.writeUInt32BE(dados.length); const c = Buffer.alloc(4); c.writeUInt32BE(cr(t));
        return Buffer.concat([n, t, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    fs.writeFileSync(ficheiro, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(bruto)), bloco('IEND', Buffer.alloc(0))]));
}

/* ---- cena ---- */
const { corpo, rig } = mod.construirCorpo('#3498db', '#34495e', mod.escolherAparencia(0, 11, 0));
new THREE.Scene().add(corpo);
const cam = new THREE.PerspectiveCamera(40, W / H, 0.05, 100);

const CANTOS = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
const FACES = [[0,1,2,3],[4,5,6,7],[0,1,5,4],[3,2,6,7],[0,3,7,4],[1,2,6,5]];

function desenhar(K, aplicar, ficheiro, camPos, alvo) {
    corpo.position.set(0, 0, 0); corpo.rotation.set(0, 0, 0);
    aplicar(rig, K, corpo);
    corpo.updateMatrixWorld(true);
    cam.position.set(...camPos); cam.lookAt(...alvo); cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();

    const p = tela();
    // relvado: a linha do chao
    const solo = new THREE.Vector3(0, mod.ALTURA_BASE_Y, 0).project(cam);
    linhaH(p, Math.round((1 - solo.y) * 0.5 * H), [40, 80, 40]);

    const quads = [];
    corpo.traverse(o => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
        const g = o.geometry; g.computeBoundingBox(); const b = g.boundingBox;
        const v = CANTOS.map(([sx, sy, sz]) => o.localToWorld(new THREE.Vector3(
            sx < 0 ? b.min.x : b.max.x, sy < 0 ? b.min.y : b.max.y, sz < 0 ? b.min.z : b.max.z)));
        const ecra = v.map(q => { const n = q.clone().project(cam);
            return { x: (n.x + 1) * 0.5 * W, y: (1 - n.y) * 0.5 * H, z: q.distanceTo(cam.position) }; });
        for (const f of FACES) {
            const pts = f.map(i => ecra[i]);
            quads.push({ pts, z: (pts[0].z + pts[1].z + pts[2].z + pts[3].z) / 4 });
        }
    });
    quads.sort((a, b) => b.z - a.z);           // longe primeiro
    for (const q of quads) {
        const t = Math.max(0, Math.min(1, (q.z - 2.0) / 3.0));
        const tom = Math.round(235 - 150 * t);
        poligono(p, q.pts, [tom, tom, Math.min(255, tom + 20)]);
    }
    png(p, ficheiro);
}

const S = process.argv[2];
const nome = process.argv[3] || 'GoalKickClip';
const frames = nome.endsWith('.json') ? JSON.parse(fs.readFileSync(nome, 'utf8')) : mod[nome].frames;
const etiqueta = process.argv[4] || 'pose';
const aplicar = mod.aplicarPoseGoalKick;
const VISTAS = { lado: [[3.6, 1.0, 0.2], [0, 0.9, 0]], tras: [[0.3, 1.1, -3.4], [0, 0.9, 0]] };
for (const [vn, [cp, al]] of Object.entries(VISTAS))
    frames.forEach((K, i) => desenhar(K, aplicar, `${S}/${etiqueta}_${vn}_${i}.png`, cp, al));
console.log('feito');
