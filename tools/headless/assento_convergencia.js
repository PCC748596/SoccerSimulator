/*
O ASSENTO NÃO CONVERGE, E A CONTA DIZ PORQUÊ.

O `assentarNoChao` corre em ~88% dos frames do guarda-redes e ele flutua 5.8 cm
na mesma. Logo o defeito não é uma guarda a recusá-lo — é a correcção não
chegar ao fim. A suspeita está nas duas linhas que correm IMEDIATAMENTE antes
dele, no `animateBones`:

    ramo de movimento   this.model.position.y = ALTURA_BASE_Y + P.ressalto - P.descida;
    ramo parado         this.model.position.y = lerpTo(this.model.position.y, ALTURA_BASE_Y);

As duas escrevem a altura em ABSOLUTO, todos os frames. O `assentarNoChao`
depois SOMA `correccao * suavizacao` — 35% do que falta. No frame seguinte a
escrita absoluta apaga os 35% e volta-se ao princípio: a sola fica
permanentemente a (1 - suavizacao) = 65% do levantamento da pose, e nunca
converge por muitos frames que passem.

Mede-se a sola nos dois instantes do MESMO frame, com o assento envolvido:

    antes    o que a pose deixou
    depois   o que sobrou depois da correccao
    razao    depois/antes — se for ~0.65, e a suavizacao que esta a mandar

Uso: node tools/headless/assento_convergencia.js [segundos] [semente]
*/
const segundos = Number(process.argv[2] || 240);
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
global.Sim = { running: false };

// SUAVIZACAO=<0..1> para varrer o numero sem tocar no config de producao.
if (process.env.SUAVIZACAO) AssentoNoChao.suavizacao = Number(process.env.SUAVIZACAO);

const _v = new THREE.Vector3();
const solaY = (p) => {
    const rig = p.rig;
    if (!rig || !rig.lBota || !rig.rBota) return null;
    let min = Infinity;
    for (const bota of [rig.lBota, rig.rBota]) {
        const geo = bota.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const b = geo.boundingBox;
        bota.updateWorldMatrix(true, false);
        for (let ix = 0; ix < 2; ix++) for (let iy = 0; iy < 2; iy++) for (let iz = 0; iz < 2; iz++) {
            _v.set(ix ? b.max.x : b.min.x, iy ? b.max.y : b.min.y, iz ? b.max.z : b.min.z);
            _v.applyMatrix4(bota.matrixWorld);
            if (_v.y < min) min = _v.y;
        }
    }
    return isFinite(min) ? min : null;
};

/*
ENVOLVER O ASSENTO. Le-se a sola antes de ele correr e depois de ele correr, no
mesmo frame e sem mexer no metodo — se se mexesse, media-se outra coisa.
*/
const antes = [], depois = [], antesGK = [], depoisGK = [];
const descidaCorpo = [], descidaSola = [];
{
    const orig = FootballPlayer.prototype.assentarNoChao;
    FootballPlayer.prototype.assentarNoChao = function () {
        const a = solaY(this);
        const yA = this.model.position.y;
        const r = orig.call(this);
        const yD = this.model.position.y;
        const d = solaY(this);
        /*
        SO OS FRAMES EM QUE ELE MEXEU. Quarenta por cento das leituras de campo
        sao de quem vai a correr, e ai o assento sai cedo de proposito
        (`velMax`): incluidas, a razao mede a proporcao de corredores em vez de
        medir a correccao.
        */
        if (Math.abs(yD - yA) < 1e-9) return r;
        if (a !== null && d !== null) {
            // So interessa quem estava LEVANTADO: quem ja estava no chao nao
            // tem correccao nenhuma para fazer e so dilui a media.
            if (a > 0.02) {
                if (this.role === 'gk') { antesGK.push(a); depoisGK.push(d); }
                else { antes.push(a); depois.push(d); }
                // O que o corpo desceu, contra o que a sola desceu: se forem
                // diferentes, a sola nao segue o corpo e a conta e outra.
                descidaCorpo.push(yA - yD);
                descidaSola.push(a - d);
            }
        }
        return r;
    };
}

for (let i = 0; i < Math.round(segundos / dt); i++) Match.update(dt);

const med = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

console.log(`\n${(Match.tempoDeJogo / 60).toFixed(1)} min | suavizacao = ${AssentoNoChao.suavizacao}`);
console.log('\nSola da bota, no mesmo frame, so quando havia levantamento a corrigir:\n');
const linha = (nome, a, d) => {
    if (!a.length) { console.log(`  ${nome}: sem leituras`); return; }
    const ma = med(a), md = med(d);
    console.log(`  ${nome.padEnd(14)} antes ${ma.toFixed(3)}   depois ${md.toFixed(3)}   ` +
        `razao ${(md / ma).toFixed(2)}   n=${a.length}`);
};
linha('jogador campo', antes, depois);
linha('guarda-redes', antesGK, depoisGK);
console.log(`\n  (1 - suavizacao) = ${(1 - AssentoNoChao.suavizacao).toFixed(2)}` +
    `  <- se a razao bater com este numero, e a suavizacao que manda\n`);
