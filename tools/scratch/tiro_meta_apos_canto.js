/*
DEPOIS DE UM CANTO, A EQUIPA QUE VAI BATER O TIRO DE META SAI DA AREA?

Relato: *"depois do corner, os jogadores do time que vai bater o tiro de meta
nao saem de perto do goleiro"*.

Separa os tiros de meta que vem LOGO A SEGUIR A UM CANTO dos outros, e mede a
distancia de cada jogador de campo ao guarda-redes ao longo da espera.
*/
const segundos = Number(process.argv[2] || 3600);
const semente = Number(process.argv[3] || 4242);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = mulberry32(semente);
require('../headless/harness.js');
const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = false;   // precisa do animateBones? nao, mas o BT corre na mesma

const perfis = { apos_canto: [], outros: [] };
let anterior = null, veioDeCanto = false, tDesde = 0, tipo = null;

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    const st = Match.state;
    if (st !== 'GOAL_KICK') {
        if (st === 'CORNER_KICK') veioDeCanto = true;
        else if (st !== 'GOAL_KICK' && st !== 'PLAY') veioDeCanto = false;
        anterior = st; tDesde = 0; tipo = null;
        continue;
    }
    if (anterior !== 'GOAL_KICK') { tDesde = 0; tipo = veioDeCanto ? 'apos_canto' : 'outros'; veioDeCanto = false; }
    anterior = 'GOAL_KICK';
    tDesde++;

    const team = Match.setPieceTeam;
    if (!team || !tipo) continue;
    const bate = (team === 'TeamA') ? Match.players : Match.opponents;
    const gk = bate.find(p => p.role === 'gk');
    if (!gk) continue;
    const campo = bate.filter(p => p.role !== 'gk' && p.model);
    const perto = campo.filter(p => p.model.position.distanceTo(gk.model.position) < 16).length;
    const balde = Math.min(7, Math.floor(tDesde / 60));
    const lista = perfis[tipo];
    if (!lista[balde]) lista[balde] = { n: 0, soma: 0, max: 0 };
    lista[balde].n++;
    lista[balde].soma += perto;
    if (perto > lista[balde].max) lista[balde].max = perto;
}

function most(nome, lista) {
    console.log('\n' + nome + ' -- jogadores de campo a MENOS DE 16 m do proprio guarda-redes:');
    if (!lista.length) { console.log('   (nenhum lance)'); return; }
    for (let b = 0; b < lista.length; b++) {
        if (!lista[b]) continue;
        console.log('   ' + (b + '-' + (b + 1) + ' s').padEnd(9) +
            'media ' + (lista[b].soma / lista[b].n).toFixed(1).padStart(4) +
            '   pior ' + String(lista[b].max).padStart(2) +
            '   (' + lista[b].n + ' frames)');
    }
}
most('TIRO DE META APOS CANTO', perfis.apos_canto);
most('OS OUTROS TIROS DE META', perfis.outros);

/*
E QUEM SAO, AOS 6 SEGUNDOS. O perfil mostra que eles saem e VOLTAM: interessa
saber em que estado estao e para onde o alvo deles aponta.
*/
Math.random = mulberry32(semente + 3);
{
    let ant = null, deCanto = false, t = 0, vistos = 0;
    for (let i = 0; i < Math.round(3600 / dt) && vistos < 3; i++) {
        Match.update(dt);
        const st = Match.state;
        if (st !== 'GOAL_KICK') {
            if (st === 'CORNER_KICK') deCanto = true;
            else if (st !== 'PLAY') deCanto = false;
            ant = st; t = 0; continue;
        }
        if (ant !== 'GOAL_KICK') { t = 0; }
        ant = 'GOAL_KICK'; t++;
        if (t !== 360 || !deCanto) continue;
        deCanto = false; vistos++;

        const team = Match.setPieceTeam;
        const bate = (team === 'TeamA') ? Match.players : Match.opponents;
        const gk = bate.find(p => p.role === 'gk');
        console.log('\nLANCE ' + vistos + ' (apos canto), aos 6 s -- quem esta a menos de 16 m do GK:');
        for (const p of bate) {
            if (p.role === 'gk' || !p.model) continue;
            const d = p.model.position.distanceTo(gk.model.position);
            if (d >= 16) continue;
            const alvo = p.dynamicTarget;
            const falta = alvo ? p.model.position.distanceTo(alvo) : -1;
            console.log('   ' + (p.pos || p.role).padEnd(4) +
                ' a ' + d.toFixed(1).padStart(5) + ' m do GK   estado ' +
                String(p.fsm && p.fsm.currentState).padEnd(16) +
                ' falta ' + falta.toFixed(1) + ' m ate ao alvo');
        }
    }
}
