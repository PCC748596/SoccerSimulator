/*
LIVRE DE IMPEDIMENTO: ONDE FICAM AS DUAS EQUIPAS.

Relato, com captura de campo inteiro: "o posicionamento dos jogadores na batida
do impedimento tá bem ruim. Uns de um lado do campo e outros do outro." Na
imagem, a bola está junto à área da esquerda e há um grupo lá e outro grupo
encostado à área da direita — os dois blocos do debug não se tocam.

É a mesma pergunta que o `tiro_de_meta.js` faz, e por bom motivo: o
`nivel2Activo()` deixa o FREE_KICK de fora, portanto quem escreve as posições é
o `setupSetPiece` UMA vez, e o que ele não escrever fica onde a jogada anterior
deixou. No tiro de meta o defeito era o contrário (o nível 2 corria e refazia
tudo); aqui a suspeita é a metade que ninguém coloca.

Mede, com o lance de pé:

  - a distância de cada jogador À BOLA, por equipa — é a leitura que o relato
    descreve ("uns de um lado, outros do outro");
  - quantos ficaram a mais de meio campo da bola;
  - a profundidade no referencial de ataque de quem bate;
  - e quantos foram mesmo COLOCADOS pelo setup, contra os que ficaram onde
    estavam. Sem esta última não se distingue "está mal colocado" de "não foi
    colocado de todo".

Uso: node tools/headless/livre_impedimento.js [quantos]
*/
const quantos = Number(process.argv[2] || 6);

require('./harness.js');

const dt = 1 / 60;
const scene = new THREE.Scene();
Match.init(scene);
if (typeof Officials !== 'undefined' && Officials.init) Officials.init(scene);
if (typeof Sim === 'undefined') global.Sim = {};
Sim.running = true;

const med = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const p50 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const acc = {
    bate: { dist: [], longe: [], prof: [], movidos: [] },
    recebe: { dist: [], longe: [], prof: [], movidos: [] },
    impedidosNaBatida: [],
    linhaNaBatida: []
};

// SEMFORMA=1 desliga a forma, para comparar com o estado anterior.
if (process.env.SEMFORMA) Match.formaDaDefesaNoLivre = function () { };

for (let n = 0; n < quantos; n++) {
    // Uns segundos de jogo para as equipas saírem da formação inicial.
    for (let i = 0; i < 600; i++) Match.update(dt);

    const equipaQueBate = (n % 2 === 0) ? 'TeamA' : 'TeamB';
    const bate = (equipaQueBate === 'TeamA') ? Match.players : Match.opponents;
    const recebe = (equipaQueBate === 'TeamA') ? Match.opponents : Match.players;
    const attDir = bate[0].dirZ;

    /*
    O SÍTIO DA BOLA é o do relato: um fora-de-jogo marca-se onde o atacante
    estava, portanto perto da área de quem defende — que é a área ATACADA por
    quem cometeu a infracção, logo o livre é batido de lá para o outro lado.
    Aqui: 30 m à frente do meio-campo no referencial de quem bate é o campo
    ADVERSÁRIO dele, e não serve; o fora-de-jogo dá o livre a quem DEFENDIA.
    Põe-se a bola no meio-campo defensivo de quem bate, encostada a um lado.
    */
    const zBola = -attDir * 25;
    Match.ball.position.set(-18, BallPhysics.raio, zBola);
    Match.ballVel.set(0, 0, 0);

    // Guardar onde cada um estava, para se ver quem o setup mexeu.
    const antes = new Map();
    for (const p of bate.concat(recebe)) antes.set(p, p.model.position.clone());

    // Fora-de-jogo dá livre INDIRECTO: é a bandeira que o árbitro põe.
    Match.faltaIndirecta = true;
    Match.setupSetPiece('FREE_KICK', equipaQueBate);

    /*
    Mede-se COM O LANCE AINDA DE PÉ. Deixar correr até sair do FREE_KICK media
    o jogo já a recomeçar.
    */
    let frames = 0;
    while (frames < 60 * 5 && Match.state === 'FREE_KICK') {
        Match.update(dt);
        frames++;
    }

    /*
    QUEM JA ESTA IMPEDIDO NO INSTANTE DA BATIDA.

    A forma do livro junta a defesa num bloco a 9.15-34 m da bola. O mais
    recuado desse bloco DESENHA A LINHA de fora-de-jogo — e os companheiros do
    batedor sao colocados a parte, pelo `lugares`. Se algum deles ficar para la
    da linha, esta impedido no momento em que a bola e jogada, e o lance nasce
    morto.

    Antes da forma, a defesa ficava espalhada e havia quase sempre alguem
    esquecido la atras a segurar a linha em baixo — o que TAPAVA isto.
    */
    {
        const attDir = bate[0].dirZ;
        const campoD = recebe.filter(p => p.role !== 'gk' && p.model);
        const campoA = bate.filter(p => p.role !== 'gk' && p.model && p !== Match.setPieceTaker);
        if (campoD.length && campoA.length) {
            // Linha: o defensor mais recuado, no referencial de ataque de quem bate.
            const linhaZ = Math.max(...campoD.map(p => p.model.position.z * attDir));
            const bolaZ = Match.ball.position.z * attDir;
            // Lei 11: so esta impedido quem esta a frente da linha E da bola.
            const impedidos = campoA.filter(p =>
                p.model.position.z * attDir > linhaZ &&
                p.model.position.z * attDir > bolaZ).length;
            acc.impedidosNaBatida.push(impedidos);
            acc.linhaNaBatida.push(linhaZ);
        }
    }

    const bola = Match.ball.position;
    for (const [nome, lista] of [['bate', bate], ['recebe', recebe]]) {
        const campo = lista.filter(p => p.role !== 'gk');
        const ds = campo.map(p => Math.hypot(
            p.model.position.x - bola.x, p.model.position.z - bola.z));
        acc[nome].dist.push(med(ds));
        acc[nome].longe.push(ds.filter(d => d > 53).length);
        acc[nome].prof.push(med(campo.map(p => p.model.position.z * attDir)));
        acc[nome].movidos.push(campo.filter(p =>
            antes.get(p).distanceTo(p.model.position) > 1.0).length);
    }
}

console.log(`\n${quantos} livres de impedimento, bola a 25 m da baliza de quem bate\n`);
console.log('                 dist. media   a mais de     profundidade   colocados');
console.log('                 a bola        meio campo    (z*attDir)     pelo setup');
for (const nome of ['bate', 'recebe']) {
    const a = acc[nome];
    console.log(`  equipa que ${nome.padEnd(7)} ${med(a.dist).toFixed(1).padStart(6)} m   ` +
        `${med(a.longe).toFixed(1).padStart(6)} / 10   ` +
        `${med(a.prof).toFixed(1).padStart(9)} m   ` +
        `${med(a.movidos).toFixed(1).padStart(7)} / 10`);
}
/*
O NUMERO DA SUSPEITA. Se a forma da defesa juntar o bloco, o mais recuado sobe,
a linha de fora-de-jogo sobe com ele, e os companheiros do batedor — colocados
a parte, pelo `lugares` — podem ficar do lado errado dela ANTES de a bola sair.
*/
console.log(`\n  ATACANTES JA IMPEDIDOS no instante da batida: ` +
    `${med(acc.impedidosNaBatida).toFixed(2)} de 9   ` +
    `(linha a ${med(acc.linhaNaBatida).toFixed(1)} m no referencial de quem bate)`);
console.log('\n  Num livre a serio as duas equipas estao a menos de 40 m da bola:');
console.log('  quem ataca a procurar a bola, quem defende entre ela e a propria baliza.');
console.log('  -52 = linha de fundo de quem bate | 0 = meio-campo | +52 = baliza adversaria\n');
