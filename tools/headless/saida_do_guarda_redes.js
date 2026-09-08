/*
COM A BOLA NAS MÃOS DO GUARDA-REDES: A EQUIPA DÁ OPÇÕES?

Relato: "quando o goleiro pega a bola os jogadores do time com a bola demoram a
se reposicionar para sair jogando; tem jogadores ficando atrás do goleiro (entre
o goleiro e o próprio gol)".

Mede, durante os segundos em que ele segura a bola:
  - quantos companheiros estão ATRÁS dele (entre ele e a própria baliza);
  - a que distância dele está o companheiro mais próximo (a opção curta);
  - quantos estão parados (velocidade quase nula) em vez de se oferecerem.

Uso: node tools/headless/saida_do_guarda_redes.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 900);
const semente = Number(process.argv[3] || 0);

const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Math.random = mulberry32(1000 + semente * 977);

require('./harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

let amostras = 0, atras = 0, parados = 0, episodios = 0;
const maisPerto = [], atrasPorFrame = [], velMedia = [], alvoAtras = [], tactAtras = [];
const estados = {}; const porEstado = {};
let segurava = { TeamA: false, TeamB: false };

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (i % 6) continue;

    for (const eq of ['TeamA', 'TeamB']) {
        const segura = Match.gkHoldingBall && Match.gkHoldingBall[eq];
        if (segura && !segurava[eq]) episodios++;
        segurava[eq] = segura;
        if (!segura) continue;

        const lista = (eq === 'TeamA') ? Match.players : Match.opponents;
        const gk = lista[0];
        if (!gk) continue;
        const gkAvanco = gk.model.position.z * gk.dirZ;

        amostras++;
        porEstado[Match.state] = porEstado[Match.state] || { n: 0, atras: 0 };
        let nAtras = 0, dMin = 999, vSoma = 0, n = 0, nAlvoAtras = 0, nTactAtras = 0;
        for (const p of lista) {
            if (p === gk || p.role === 'gk') continue;
            n++;
            const avanco = p.model.position.z * p.dirZ;
            if (avanco < gkAvanco) { nAtras++; atras++; }
            if (p.dynamicTarget && p.dynamicTarget.z * p.dirZ < gkAvanco) nAlvoAtras++;
            if (p.tacticalTarget && p.tacticalTarget.z * p.dirZ < gkAvanco) nTactAtras++;
            estados[p.fsm.currentState] = (estados[p.fsm.currentState] || 0) + 1;
            dMin = Math.min(dMin, p.model.position.distanceTo(gk.model.position));
            const v = p.velocity ? p.velocity.length() : 0;
            vSoma += v;
            if (v < 0.5) parados++;
        }
        porEstado[Match.state].n++;
        porEstado[Match.state].atras += nAtras;
        atrasPorFrame.push(nAtras);
        alvoAtras.push(nAlvoAtras);
        tactAtras.push(nTactAtras);
        maisPerto.push(dMin);
        velMedia.push(vSoma / Math.max(1, n));
    }
}

const med = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : '-';
console.log(`\n${(Match.tempoDeJogo / 60).toFixed(0)} min | ${episodios} vezes com a bola nas maos | ${amostras} leituras`);
console.log(`companheiros ATRAS do guarda-redes: ${med(atrasPorFrame)} por leitura (pior ${Math.max(0, ...atrasPorFrame)})`);
console.log(`leituras com pelo menos um atras:   ${(100 * atrasPorFrame.filter(n => n > 0).length / Math.max(1, atrasPorFrame.length)).toFixed(0)}%`);
console.log(`ALVO (dynamicTarget) atras dele:    ${med(alvoAtras)} por leitura`);
console.log(`ALVO do TeamBT (tacticalTarget):     ${med(tactAtras)} por leitura`);
console.log('atras por estado do jogo:', Object.entries(porEstado).map(([k, v]) => `${k} ${(v.atras / v.n).toFixed(2)} (n=${v.n})`).join('  '));
console.log('estados:', Object.entries(estados).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>`${k} ${v}`).join('  '));
console.log(`companheiro mais perto dele:        ${med(maisPerto)} m`);
console.log(`velocidade media dos companheiros:  ${med(velMedia)} m/s | parados (<0.5 m/s): ${(100 * parados / Math.max(1, amostras * 10)).toFixed(0)}%`);
