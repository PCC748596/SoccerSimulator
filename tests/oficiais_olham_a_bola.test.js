/*
OS OFICIAIS NAO FICAM DE COSTAS PARA A BOLA (js/officials_olham_a_bola.js).
Relato repetido: o juiz e os bandeirinhas andam de costas para a bola. Corre o jogo e mede, em cada frame, o angulo
entre a frente de cada oficial e a direccao da bola (quando ela esta a mais de 1.5 m dele). Com o guarda ligado,
nenhum frame pode passar do limite + 12 graus (o guarda corrige a seguir ao update; a tolerancia cobre a
suavizacao), e o arbitro so pode estar fora enquanto faz um sinal.
*/
require('../tools/headless/harness.js');
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;
let falhas = 0;
const erro = m => { falhas++; console.error('  X ' + m); };
const ok = (c, m) => { if (!c) erro(m); };

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function correr(guarda, segundos) {
    Math.random = mulberry32(4242);
    OficiaisOlhamABola.activo = guarda;
    const cena = new THREE.Scene();
    Match.init(cena);
    Officials.arbitro = null; Officials.init(cena);
    const G = OficiaisOlhamABola.anguloMaxGraus;
    const lim = { arbitro: G.arbitro, assistente: G.assistente };
    const dt = 1 / 60;
    let frames = 0, fora = 0, pior = 0;
    for (let i = 0; i < Math.round(segundos / dt); i++) {
        Match.update(dt);
        if (!Officials.arbitro) continue;
        const lista = [['arbitro', Officials.arbitro]].concat((Officials.assistentes || []).map(a => ['assistente', a]));
        for (const [tipo, o] of lista) {
            if (!o || !o.model) continue;
            if (tipo === 'arbitro' && o.sinal) continue;
            const ox = Match.ball.position.x - o.model.position.x, oz = Match.ball.position.z - o.model.position.z;
            if (Math.hypot(ox, oz) < 1.5) continue;
            const d = Math.abs(Math.atan2(Math.sin(o.model.rotation.y - Math.atan2(ox, oz)), Math.cos(o.model.rotation.y - Math.atan2(ox, oz)))) * 180 / Math.PI;
            frames++;
            pior = Math.max(pior, d);
            if (d > lim[tipo] + 12) fora++;
        }
    }
    return { frames, fora, pior };
}

const com = correr(true, 240);
const sem = correr(false, 240);
console.log(`com guarda: ${com.fora}/${com.frames} frames fora do limite, pior ${com.pior.toFixed(0)} graus | sem guarda: ${sem.fora}/${sem.frames}, pior ${sem.pior.toFixed(0)} graus`);
ok(com.frames > 1000, 'poucos frames medidos: ' + com.frames);
ok(com.fora === 0, 'com o guarda ligado ha oficiais de costas para a bola: ' + com.fora + ' frames, pior ' + com.pior.toFixed(0) + ' graus');

if (falhas) { console.error(falhas + ' falha(s)'); process.exit(1); }
console.log('OK oficiais_olham_a_bola');
