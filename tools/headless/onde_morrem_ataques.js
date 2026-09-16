/*
ONDE MORREM AS POSSES — os ataques totais estão a 36% do alvo.

O lote de 60 jogos dá 63.7 ataques por jogo contra os 176.6 do alvo. Um
"ataque" é uma sequência de posse que chegou a passar o meio-campo (ver
MatchStats.fecharAtaque); a conta é fechada quando a posse muda de equipa ou a
bola sai.

Este instrumento não olha para o contador: segue as SEQUÊNCIAS e diz, para cada
uma, até onde chegou e o que a matou. Sem saber onde morrem, calibrar
frequências é adivinhar.

Uso: node tools/headless/onde_morrem_ataques.js [segundos] [semente]
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

/*
A CAUSA DA MORTE é lida do que aconteceu no frame em que a posse mudou. As
folhas que a produzem estão em sítios diferentes do código, e é por isso que se
embrulham aqui em vez de se ler um estado só.
*/
let ultimaCausa = null;
const marcar = (c) => { ultimaCausa = { c: c, t: 0 }; };

/*
E A "DISPUTA" ABERTA: 65% das posses morriam sem nenhuma das causas acima. Isto
separa-as — quem ganhou a bola fê-lo a dominar uma bola solta, a apanhar um
passe falhado, ou a interceptar uma linha de passe? A pergunta é: a bola estava
ENDEREÇADA a alguém quando o adversário lhe chegou?
*/
let ultimoPasse = null;
{
    const orig = global.executePassGameplay;
    global.executePassGameplay = function (p) {
        const r = orig.apply(this, arguments);
        ultimoPasse = { team: p.team, destinatario: Match.intendedReceiver, t: 0 };
        return r;
    };
}
{
    const p = FootballPlayer.prototype;
    for (const [nome, causa] of [
        ['initiateShoot', 'remate'], ['executeHeader', 'cabecada'],
        ['grabBall', 'guarda-redes agarrou'], ['puntBall', 'chutao do GK'],
        ['initiateTackle', 'desarme sofrido'], ['initiateSlideTackle', 'carrinho sofrido']
    ]) {
        if (typeof p[nome] !== 'function') continue;
        const of = p[nome];
        p[nome] = function () { marcar(causa); return of.apply(this, arguments); };
    }
    const od = Match.deflectBall.bind(Match);
    Match.deflectBall = function (j) { marcar('dominio falhado'); return od(j); };
    const os = Match.setupSetPiece.bind(Match);
    Match.setupSetPiece = function (tipo, team) { marcar('bola fora: ' + tipo); return os(tipo, team); };
}

const seqs = [];
let seq = null;
let posseAnterior = null;

for (let i = 0; i < Math.round(segundos / dt); i++) {
    Match.update(dt);
    if (ultimaCausa) ultimaCausa.t += dt;

    if (ultimoPasse) ultimoPasse.t += dt;

    const posse = Match.possessionTeam;
    if (posse !== posseAnterior) {
        if (seq) {
            // Causa fresca (menos de 0.5 s): é a que matou esta sequência.
            if (ultimaCausa && ultimaCausa.t < 0.5) {
                seq.causa = ultimaCausa.c;
            } else if (ultimoPasse && ultimoPasse.t < 3.0 && ultimoPasse.team === seq.team) {
                /*
                Havia um passe DELES em voo (ou acabado de chegar) quando a bola
                mudou de dono: é passe falhado, e distingue-se pelo destinatário.
                */
                seq.causa = ultimoPasse.destinatario
                    ? 'passe interceptado/nao chegou'
                    : 'passe sem destinatario';
            } else {
                seq.causa = 'bola solta ganha pelo adversario';
            }
            seqs.push(seq);
        }
        seq = posse ? { team: posse, t: 0, avancoMax: -60, passouMeio: false, tercoFinal: false, passes: 0 } : null;
        posseAnterior = posse;
    }

    if (seq && Match.ball) {
        seq.t += dt;
        const dir = (seq.team === 'TeamA') ? 1 : -1;
        const avanco = Match.ball.position.z * dir;
        if (avanco > seq.avancoMax) seq.avancoMax = avanco;
        if (avanco > 0) seq.passouMeio = true;
        if (avanco > CAMPO_COMP / 2 - 35) seq.tercoFinal = true;
    }
}

const min = Match.tempoDeJogo / 60;
const por90 = (n) => (n * 90 / min).toFixed(1);
const med = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : '-';

const passaram = seqs.filter(s => s.passouMeio);
const terco = seqs.filter(s => s.tercoFinal);
console.log(`\n${min.toFixed(0)} min | ${seqs.length} sequencias de posse (${por90(seqs.length)}/90)`);
console.log(`  passaram o meio-campo: ${passaram.length} (${por90(passaram.length)}/90)  <- e isto que o relatorio chama ATAQUES`);
console.log(`  chegaram ao ultimo terco: ${terco.length} (${por90(terco.length)}/90)`);
console.log(`duracao media da posse: ${med(seqs.map(s => s.t))} s | avanco maximo medio: ${med(seqs.map(s => s.avancoMax))} m (0 = meio-campo)`);

const porCausa = {};
for (const s of seqs) porCausa[s.causa] = (porCausa[s.causa] || 0) + 1;
console.log('\nCOMO MORREM (todas):');
for (const [k, v] of Object.entries(porCausa).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(24)} ${String(v).padStart(4)}  ${(100 * v / seqs.length).toFixed(0)}%`);
}

const porCausaMeio = {};
for (const s of seqs.filter(x => !x.passouMeio)) porCausaMeio[s.causa] = (porCausaMeio[s.causa] || 0) + 1;
console.log(`\nAS QUE NEM CHEGAM AO MEIO-CAMPO (${seqs.length - passaram.length}, ${(100 * (seqs.length - passaram.length) / seqs.length).toFixed(0)}%):`);
for (const [k, v] of Object.entries(porCausaMeio).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(24)} ${String(v).padStart(4)}`);
}
