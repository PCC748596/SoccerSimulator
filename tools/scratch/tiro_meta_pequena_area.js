/*
QUEM FICA DENTRO DA PEQUENA AREA NO TIRO DE META.

Relato: *"tem jogadores ficando dentro da pequena area no tiro de meta"*.

A Lei 16 poe a bola em qualquer ponto da PEQUENA AREA e manda os adversarios
para FORA DA GRANDE AREA ate a bola estar em jogo. Dentro da pequena area, so
o batedor tem ali o que fazer -- os colegas ficam a espera da saida, nao em
cima da bola.

Monta o tiro de meta em varios pontos da pequena area e conta quem la esta.
*/
require('../headless/harness.js');
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const dt = 1 / 60;
for (let i = 0; i < 600; i++) Match.update(dt);   // tirar toda a gente da formacao inicial

const dentroDaPequena = (p, linhaZ, attDir) => {
    const dz = (p.model.position.z - linhaZ) * attDir;   // 0 na linha de fundo, cresce para dentro
    return dz >= -0.5 && dz <= Area.pequenaProfundidade &&
        Math.abs(p.model.position.x) <= Area.pequenaMeiaLargura;
};
const dentroDaGrande = (p, linhaZ, attDir) => {
    const dz = (p.model.position.z - linhaZ) * attDir;
    return dz >= -0.5 && dz <= Area.profundidade &&
        Math.abs(p.model.position.x) <= Area.meiaLargura;
};

console.log('pequena area: ' + Area.pequenaProfundidade + ' m de fundo, +-' +
    Area.pequenaMeiaLargura + ' m de largura');
console.log('grande area:  ' + Area.profundidade + ' m de fundo, +-' +
    Area.meiaLargura + ' m de largura\n');

let totalPequena = 0, totalGrande = 0, lances = 0;
console.log('  bola na pequena area        bate(TeamA)          defende(TeamB)');
console.log('     x       z        pequena  grande  gk?   pequena  grande');
for (const bx of [-7, 0, 7]) {
    for (const bz of [1.5, 4.0]) {
        const attDir = 1;                       // TeamA ataca para +z, bate do seu lado
        const linhaZ = -attDir * (CAMPO_COMP / 2);
        Match.ball.position.set(bx, BallPhysics.raio, linhaZ + attDir * bz);
        Match.ballVel.set(0, 0, 0);
        Match.setupSetPiece('GOAL_KICK', 'TeamA');

        const bate = Match.players, defende = Match.opponents;
        const pB = bate.filter(p => dentroDaPequena(p, linhaZ, attDir));
        const gB = bate.filter(p => p.role !== 'gk' && dentroDaGrande(p, linhaZ, attDir));
        const pD = defende.filter(p => dentroDaPequena(p, linhaZ, attDir));
        const gD = defende.filter(p => dentroDaGrande(p, linhaZ, attDir));
        const comGk = pB.some(p => p.role === 'gk');
        const semGk = pB.filter(p => p.role !== 'gk').length;
        totalPequena += semGk + pD.length;
        totalGrande += gD.length;
        lances++;
        console.log('  ' + String(bx).padStart(5) + '  ' + bz.toFixed(1).padStart(5) + '        ' +
            String(semGk).padStart(5) + '   ' + String(gB.length).padStart(5) + '   ' +
            (comGk ? 'sim' : 'nao') + '     ' +
            String(pD.length).padStart(5) + '   ' + String(gD.length).padStart(5));
        for (const p of pB) {
            if (p.role === 'gk') continue;
            const dz = (p.model.position.z - linhaZ) * attDir;
            console.log('        ^ ' + (p.pos || p.role) + ' a ' + dz.toFixed(1) +
                ' m da linha, x ' + p.model.position.x.toFixed(1));
        }
    }
}
console.log('\n  jogadores de campo dentro da PEQUENA area, por lance: ' +
    (totalPequena / lances).toFixed(1));
console.log('  adversarios dentro da GRANDE area, por lance:          ' +
    (totalGrande / lances).toFixed(1));

/*
E AO LONGO DA ESPERA. A montagem inicial esta limpa; o que interessa e saber
se alguem volta a entrar enquanto o lance espera pela cobranca.
*/
{
    const attDir = 1;
    const linhaZ = -attDir * (CAMPO_COMP / 2);
    Match.ball.position.set(0, BallPhysics.raio, linhaZ + attDir * 4.0);
    Match.ballVel.set(0, 0, 0);
    Match.setupSetPiece('GOAL_KICK', 'TeamA');

    console.log(String.fromCharCode(10) + 'AO LONGO DA ESPERA (bola no centro da pequena area):');
    console.log('  seg   estado          na pequena (sem GK)   quem');
    for (let f = 0; f <= 60 * 10; f++) {
        if (f % 30 === 0) {
            const dentro = Match.players.concat(Match.opponents)
                .filter(p => p.role !== 'gk' && dentroDaPequena(p, linhaZ, attDir));
            console.log('  ' + (f / 60).toFixed(1).padStart(4) + '   ' +
                String(Match.state).padEnd(14) + '        ' +
                String(dentro.length).padStart(2) + '            ' +
                dentro.map(p => (p.team === 'TeamA' ? 'bate:' : 'def:') + (p.pos || p.role)).join(' '));
        }
        Match.update(dt);
    }
}
