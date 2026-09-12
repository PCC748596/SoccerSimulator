/*
Gera `data/squads.js` a partir de `assets/players.json` e `assets/teams.json`.
Não corre durante o jogo — é offline, como o `gen_player_skills.js`.

PORQUE EXISTE: o ficheiro de jogadores tem 5 MB e 79 campos por jogador. O
motor lê nove skills e uma posição. Mandar os 5 MB para o browser para usar
um décimo deles é pagar o arranque da página por nada, e obrigaria o jogo a
saber ler o formato do ficheiro de origem — que não é dele.

O que sai daqui é só o que o jogo usa, já traduzido (ver js/config/skill_map.js,
que é onde a tradução vive e se afina).

Uso: node tools/gen_squads.js [minPlantel]
*/
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const MIN_PLANTEL = Number(process.argv[2] || 16);

/*
O `skill_map.js` é um script clássico, como todo o `js/config` — o browser
carrega-o por <script src>. Traz no fim um `module.exports` atrás de uma
guarda, e é por aí que o conversor e os testes lhe chegam sem haver duas
cópias da tradução.
*/
const { SkillMap, SkillCalib, PosicaoPorIndice, PbPorPos, EstiloJsonParaMotor,
    skillDeAtributos, calibrarSkill, escolherOnzeDaFormacao, estiloDeAtributos,
    notasDeEstilo } = require(path.join(RAIZ, 'js/config/skill_map.js'));

/*
A formação de referência para medir a escala — a mesma por omissão do jogo.
Só as POSIÇÕES interessam aqui, não a geometria, e por isso não se carrega o
`tactics.js` (que mexe no `window` e não corre fora do browser).
*/
const ONZE_442 = ['GK', 'RB', 'CB', 'CB', 'LB', 'RM', 'CM', 'CM', 'LM', 'CF', 'CF'];

const players = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/players.json'), 'utf8'));
const teams = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/teams.json'), 'utf8'));

/*
Os nomes vêm do ficheiro de origem com aspas a mais — `"""4 de Julho EC"""` —
e alguns com espaços à volta. É um defeito do export, não uma decisão.
*/
function limparNome(s) {
    return String(s || '').replace(/^[\s"]+|[\s"]+$/g, '').trim();
}

/*
O PAPEL do motor a partir da posição. A tabela é a mesma do FormationsData
(ver tactics.js): os extremos são 'atk' e não 'mid', que é o que a árvore
usa para decidir quem ataca a profundidade.
*/
const ROLE_POR_POS = {
    GK: 'gk',
    RB: 'def', LB: 'def', CB: 'def',
    DM: 'mid', CM: 'mid', RM: 'mid', LM: 'mid', AM: 'mid',
    RW: 'atk', LW: 'atk', CF: 'atk'
};

function converterJogador(reg) {
    const idx = Number(reg.firstPosition) - 1;
    const pos = PosicaoPorIndice[idx] || 'CM';

    const skills = {};
    for (const chave in SkillMap) {
        const v = skillDeAtributos(reg, SkillMap[chave]);
        if (v !== null) skills[chave] = v;
    }

    // As avaliações por posição, que é por onde se escolhe o onze.
    const pb = {};
    for (const p in PbPorPos) {
        let melhor = 0;
        for (const col of PbPorPos[p]) {
            const v = Number(reg[col]);
            if (isFinite(v) && v > melhor) melhor = v;
        }
        pb[p] = melhor;
    }

    const nome = limparNome(reg.shirtName) || limparNome(reg.pseudonym) ||
        limparNome(reg.lastName) || limparNome(reg.firstName) || 'Jogador';

    /*
    O ESTILO dos dados, quando existe. O derivado é escrito na segunda passagem
    (ver derivarEstilos), que precisa da população da posição para comparar as
    candidaturas.
    */
    const doFicheiro = EstiloJsonParaMotor[reg.playingStyle] || null;

    return {
        id: Number(reg.playerID) || 0,
        nome: nome,
        pos: pos,
        role: ROLE_POR_POS[pos] || 'mid',
        numero: Number(reg.shirtNumber) || 0,
        estilo: doFicheiro,
        estiloOrigem: doFicheiro ? 'dados' : null,
        _reg: reg,
        pb: pb,
        ...skills
    };
}

/*
A ESCALA DOS DADOS, medida AQUI e não escrita à mão: se o ficheiro de origem
mudar, a normalização acompanha sozinha. Ver SkillCalib em skill_map.js, que
explica porque é preciso.

O `gk` mede-se só nos GUARDA-REDES. Medido em toda a gente, a média da skill
de guarda-redes é a de 3 000 jogadores de campo — e os 300 que jogam mesmo à
baliza ficavam todos a quatro sigmas da média, ou seja, todos a 100.
*/
function estatistica(valores) {
    const v = valores.filter(x => typeof x === 'number' && isFinite(x));
    if (!v.length) return { media: 0, desvio: 0 };
    const media = v.reduce((a, b) => a + b, 0) / v.length;
    const desvio = Math.sqrt(v.reduce((a, b) => a + (b - media) * (b - media), 0) / v.length);
    return { media: media, desvio: desvio };
}

/*
A ESCALA MEDE-SE NOS TITULARES, e não no plantel inteiro.

Medida no plantel todo, a normalização punha a MÉDIA DO PLANTEL na banda do
motor — e quem joga não é a média do plantel, é o melhor onze de 40 a 60
jogadores. Medido: com a escala do plantel, o onze escolhido saía a 86.9 de
média contra os 82 dos genéricos para que o jogo está calibrado, e um lote de
60 jogos dava 3.85 golos por 90 contra os 2.52 reais.

Com a escala dos titulares, é o ONZE que cai na banda do motor e o banco fica
abaixo dele — que é o que um banco é.
*/
function calibrarPlanteis(todos, titulares) {
    const pop = {};
    const amostra = (titulares && titulares.length >= 100) ? titulares : todos;
    for (const chave in SkillMap) {
        const fonte = (chave === 'gk')
            ? amostra.filter(j => j.pos === 'GK')
            : amostra;
        pop[chave] = estatistica(fonte.map(j => j[chave]));
    }
    for (const j of todos) {
        for (const chave in SkillMap) {
            const alvo = SkillCalib.alvo[chave];
            if (!alvo) continue;
            j[chave] = calibrarSkill(j[chave], pop[chave], alvo);
        }
    }
    return pop;
}

/*
OS ESTILOS DERIVADOS, em duas passagens.

A primeira mede, POR POSIÇÃO, a média e o desvio da nota de cada candidatura;
a segunda escolhe, para cada jogador, aquela em que ele mais se destaca dos
outros da mesma posição. A razão está em `estiloDeAtributos` (skill_map.js):
comparar notas em bruto fazia quase todos os centrais destruidores, porque
neste ficheiro os centrais desarmam melhor do que passam.
*/
function derivarEstilos(todos) {
    const notasPorPos = new Map();
    for (const j of todos) {
        const notas = notasDeEstilo(j._reg, j.pos);
        if (!notas) continue;
        if (!notasPorPos.has(j.pos)) notasPorPos.set(j.pos, []);
        notasPorPos.get(j.pos).push(notas);
    }

    const pop = new Map();
    for (const [pos, lista] of notasPorPos) {
        const porEstilo = {};
        for (const estilo of Object.keys(lista[0])) {
            porEstilo[estilo] = estatistica(lista.map(x => x[estilo]));
        }
        pop.set(pos, porEstilo);
    }

    for (const j of todos) {
        if (!j.estilo) {
            const derivado = estiloDeAtributos(j._reg, j.pos, pop.get(j.pos));
            if (derivado) { j.estilo = derivado; j.estiloOrigem = 'derivado'; }
        }
        delete j._reg;
    }
}

// Planteis por equipa.
const porEquipa = new Map();
for (const reg of players) {
    const id = Number(reg.teamID);
    if (!porEquipa.has(id)) porEquipa.set(id, []);
    porEquipa.get(id).push(reg);
}

const infoEquipa = new Map();
for (const t of teams) infoEquipa.set(Number(t.teamID), t);

/*
A conversão corre toda ANTES da filtragem por plantel jogável: a escala mede-se
na população inteira do ficheiro, e não só nas equipas que sobram.
*/
const convertidos = new Map();
for (const [id, lista] of porEquipa) convertidos.set(id, lista.map(converterJogador));

/*
Os titulares de cada plantel jogável, pela mesma regra que o jogo usa. Os
guarda-redes do onze são poucos (um por equipa), e por isso a escala do `gk`
mede-se neles: são esses que defendem.
*/
const titulares = [];
for (const [, plantel] of convertidos) {
    if (plantel.length < MIN_PLANTEL) continue;
    const onze = escolherOnzeDaFormacao(plantel, ONZE_442);
    if (onze) titulares.push(...onze);
}
const popMedida = calibrarPlanteis([...convertidos.values()].flat(), titulares);
derivarEstilos([...convertidos.values()].flat());

const equipas = [];
const rejeitadas = [];
for (const [id, lista] of porEquipa) {
    const plantel = convertidos.get(id);
    const temGK = plantel.some(j => j.pos === 'GK');

    /*
    Só entram planteis JOGÁVEIS. Sem guarda-redes ou com menos de onze, montar
    a equipa obrigaria a inventar jogadores — e uma equipa inventada a meio de
    um plantel real é pior do que ela não existir na lista.
    */
    if (plantel.length < MIN_PLANTEL || !temGK) {
        rejeitadas.push({ id: id, n: plantel.length, gk: temGK });
        continue;
    }

    const info = infoEquipa.get(id);
    equipas.push({
        id: id,
        nome: limparNome(info ? info.teamName : lista[0].teamName),
        cidade: info ? limparNome(info.teamCityName) : '',
        estadio: info ? limparNome(info.teamStadiumName) : '',
        pais: info ? String(info.country || '') : '',
        prestigio: info ? Number(info.nationalPrestige) || 0 : 0,
        adeptos: info ? Number(info.fanBase) || 0 : 0,
        plantel: plantel
    });
}

equipas.sort((a, b) => a.nome.localeCompare(b.nome));

const data = {
    _gerado: 'tools/gen_squads.js — não editar à mão, mexer no script ou em js/config/skill_map.js e correr de novo',
    _fonte: 'assets/players.json + assets/teams.json',
    // A escala medida nos dados de origem, para se poder ver de onde veio a
    // normalização sem ter de correr a ferramenta outra vez.
    _escalaDeOrigem: popMedida,
    equipas: equipas
};

const outJson = path.join(RAIZ, 'data', 'squads.json');
fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(data, null, 1));

/*
Wrapper .js com os mesmos dados, pela mesma razão do `player_skills.js`:
carregado por <script src>, e assim o jogo abre também em file:// sem o
fetch() falhar.
*/
const outJs = path.join(RAIZ, 'data', 'squads.js');
fs.writeFileSync(outJs, 'const SquadsData = ' + JSON.stringify(data) + ';\n');

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
const todosJog = equipas.flatMap(e => e.plantel);
const dos = (o) => todosJog.filter(j => j.estiloOrigem === o).length;
const estilos = {};
for (const j of todosJog) if (j.estilo) estilos[j.estilo] = (estilos[j.estilo] || 0) + 1;
console.log(`${equipas.length} equipas jogáveis (>= ${MIN_PLANTEL} jogadores e 1 GK), ${rejeitadas.length} rejeitadas`);
console.log(`playing styles: ${dos('dados')} dos dados, ${dos('derivado')} derivados dos atributos, ` +
    `${todosJog.length - dos('dados') - dos('derivado')} sem estilo (${Object.keys(estilos).length} estilos diferentes em uso)`);
console.log(`Escrito ${outJson} (${kb(outJson)}) e ${outJs} (${kb(outJs)})`);
