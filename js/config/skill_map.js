/*
=============================================================================
DE `assets/players.json` PARA AS SKILLS DO MOTOR
=============================================================================
O ficheiro de dados traz 79 campos por jogador, com a granularidade de um
manager (`tackleStanding` e `tackleSliding` separados, `posOffense` e
`posDefense`, `diving`/`handling`/`reflexes`). O motor lê NOVE skills, através
de `player.skillFor(campo)` — ver js/player.js.

Este ficheiro é a tradução entre os dois, e vive aqui e não dentro do
`tools/gen_squads.js` por uma razão prática: afinar o peso de um atributo não
pode obrigar a ir mexer no conversor. O conversor lê ESTE ficheiro e volta a
escrever `data/squads.js`; os testes lêem-no para conferir o que saiu.

Cada skill é uma média PESADA dos campos listados. Os pesos são relativos
(normalizam-se sozinhos), portanto `{ a: 2, b: 1 }` é "o dobro do a".
=============================================================================
*/
const SkillMap = {
    /*
    GUARDA-REDES. `posGK` é o posicionamento dentro da baliza e vale tanto
    como as mãos: um guarda-redes bem posto defende o que um mal posto nem
    alcança. `onos` é o um-para-um (one-on-ones no ficheiro de origem).
    */
    gk: { diving: 1, handling: 1, reflexes: 1, posGK: 1, onos: 0.5 },

    /*
    TÉCNICA. É a skill mais lida do motor — decide o domínio, a matada no
    peito, o drible e a potência do remate. `ballControl` manda, porque é
    literalmente o primeiro toque.
    */
    tec: { ballControl: 2, dribbling: 1, finishing: 1, agility: 0.5, balance: 0.5 },

    /*
    MARCAÇÃO — colar ao homem. O desarme de pé é a execução do que a marcação
    prepara; o carrinho conta menos, que é o recurso de quem chegou tarde.
    */
    marking: { manMarking: 2, tackleStanding: 1, tackleSliding: 0.5, aggression: 0.5 },

    /*
    INTERCEPÇÃO — ler o passe antes de ele chegar. `posDefense` é o
    posicionamento sem bola e `reactions` o tempo de reacção; as duas juntas
    são o que faz um jogador aparecer na linha de passe.
    */
    intercept: { posDefense: 2, reactions: 1, tacticalAwa: 1 },

    /*
    PASSE. O passe curto manda, mas `vision` é o que distingue quem vê o passe
    de quem só o executa, e o motor usa esta skill para as duas coisas.
    */
    pass: { passing: 2, longPassing: 1, vision: 1, composure: 0.5 },

    /*
    VELOCIDADE. Aceleração e ponta pesam igual: o jogo é de arranques curtos,
    e quase nunca se corre o suficiente para a velocidade de ponta sozinha
    decidir alguma coisa.
    */
    speed: { speed: 1, acceleration: 1 },

    /*
    FORÇA — os duelos. `jumping` entra porque o motor usa esta skill também
    nos duelos aéreos (ver o cabeceio em player_bt.js).
    */
    strength: { strength: 2, jumping: 1, balance: 1 },

    /*
    LEITURA DE JOGO. É a única skill que descreve a CABEÇA do jogador: quanto
    ele ocupa mesmo a posição que o plano colectivo lhe pede, e daí sai o erro
    de fora-de-jogo (ver a nota em tools/gen_player_skills.js).
    */
    tacticknow: { tacticalAwa: 2, vision: 1, composure: 1, experience: 0 },

    /*
    RESISTÊNCIA e FRESCURA. A `stamina` é o depósito e a `fitness` é com quanto
    dele o jogador entra em campo — `consistency` é quem não baixa de nível a
    meio do jogo, que é exactamente o que a `fitness` significa aqui.
    */
    stamina: { stamina: 1 },
    fitness: { consistency: 1, stamina: 0.5 }
};

/*
=============================================================================
A ESCALA. O ficheiro de dados e o motor não medem a mesma coisa.
=============================================================================
As médias pesadas acima devolvem números na escala do ficheiro de ORIGEM, e
essa escala não é a do motor. Medido:

    skill        motor (os 22 genéricos)     dados reais
    gk               98.5  (desvio 1.5)      56.2  (8.7)
    marking          82.7  (11)              52.8  (14)
    intercept        81.0  (8.8)             58.5  (10.6)
    tec              82.1  (8.2)             56.7  (11.9)

Um plantel real entrava em campo trinta pontos abaixo daquilo para que o jogo
foi calibrado, e viu-se no resultado: num lote de 60 jogos de 18 min, **4.83
golos por 90** contra os 2.52 do futebol a sério (com os genéricos dava 2.67).
Guarda-redes a 56 e centrais a marcar a 53 não defendem nada.

A correcção é de ESCALA e não de conteúdo: normaliza-se cada skill pelo
z-score — quem está uma sigma acima da média dos dados fica uma sigma acima da
média do motor. Quem é melhor continua melhor, e a distância relativa entre
jogadores mantém-se; o que muda é a régua.

Os desvios-alvo são os dos genéricos, com uma excepção: o `gk`. Copiar o dele
(1.5) era espremer todos os guarda-redes do país para dentro de três pontos —
deixava de haver bons e maus —, e os 98.5 de média são o gerador a bater no
tecto de 100, não uma medida de nada. Fica 97.5 ± 3: os guarda-redes continuam distinguíveis uns dos outros e a
média fica junto à dos genéricos, que é a régua com que o jogo dá os 2.5 golos
por 90. Com 96 ficavam quase três pontos abaixo dela, e o guarda-redes é a
manípula que mais mexe no resultado.
=============================================================================
*/
const SkillCalib = {
    alvo: {
        gk: { media: 97.5, desvio: 3 },
        tec: { media: 82, desvio: 8 },
        marking: { media: 83, desvio: 11 },
        intercept: { media: 81, desvio: 9 },
        pass: { media: 80, desvio: 9 },
        speed: { media: 80, desvio: 8.5 },
        strength: { media: 82, desvio: 7 },
        tacticknow: { media: 83, desvio: 7 },
        stamina: { media: 81, desvio: 7 },
        fitness: { media: 90, desvio: 6 }
    }
};

/*
Passa um valor da escala dos dados para a do motor. `pop` é a média e o desvio
medidos na população de origem dessa skill (ver SkillCalib).

Com o desvio da população a zero — uma skill em que todos os jogadores têm o
mesmo valor — não há z-score nenhum e devolve-se a média alvo, que é o que
essa situação significa: são todos iguais.
*/
function calibrarSkill(valor, pop, alvo) {
    if (typeof valor !== 'number' || !alvo) return valor;
    const desvioPop = (pop && pop.desvio > 0.001) ? pop.desvio : 0;
    if (!desvioPop) return Math.round(alvo.media);
    const z = (valor - pop.media) / desvioPop;
    const v = alvo.media + z * Math.max(alvo.desvio, 0);
    return Math.max(1, Math.min(100, Math.round(v)));
}

/*
A POSIÇÃO NATURAL, a partir do `firstPosition` do ficheiro de dados.

O campo é um índice 1..13 na mesma ordem das treze colunas `pb*` que cada
jogador traz (`pbGK`, `pbRB`, ... `pbST`). Conferido nos 3 124 jogadores do
ficheiro: em 99.7% deles o `firstPosition` aponta para a coluna `pb` mais
alta do próprio jogador, o que confirma a ordem.

`CD` (central defender) é o `CB` do motor e `ST` é um segundo avançado — o
motor só tem `CF` para os dois.
*/
const PosicaoPorIndice = [
    'GK', 'RB', 'LB', 'CB', 'DM', 'RM', 'LM', 'CM', 'RW', 'LW', 'AM', 'CF', 'CF'
];

/*
Que coluna `pb*` avalia cada posição do motor. É por aqui que se escolhe o
onze: para cada lugar da formação, o melhor jogador do plantel nessa coluna.

O `CF` lê as duas colunas de ataque e fica com a melhor — no ficheiro de
origem `CF` e `ST` são papéis diferentes (o que joga entre linhas e o que
joga na profundidade) e o motor não distingue.
*/
const PbPorPos = {
    GK: ['pbGK'], RB: ['pbRB'], LB: ['pbLB'], CB: ['pbCD'],
    DM: ['pbDM'], RM: ['pbRM'], LM: ['pbLM'], CM: ['pbCM'],
    RW: ['pbRW'], LW: ['pbLW'], AM: ['pbAM'], CF: ['pbCF', 'pbST']
};

/*
O ONZE: para cada lugar da formação, o melhor jogador do plantel nesse lugar
(a coluna `pb*` da posição — ver PbPorPos).

Guloso GLOBAL e não lugar a lugar: montam-se todos os pares (lugar, jogador),
ordenam-se pela avaliação e fica com cada lugar o melhor par ainda livre.
Percorrer os lugares pela ordem da formação dava o guarda-redes primeiro e o
resto por sobras — um médio de 90 no CM podia ir para o RM só porque o RM vem
antes na lista.

Empates desfeitos pelo índice, para a escolha ser sempre a mesma com o mesmo
plantel: um onze que muda a cada arranque não se consegue comparar entre jogos.

`posicoes` são as posições pela ORDEM DA FORMAÇÃO, e é nessa ordem que os
jogadores voltam — é o que o motor assume (a posição vem do índice, ver
assignFormations em match_setup.js).

Vive aqui, e não no motor, porque três sítios precisam exactamente da mesma
escolha: o jogo, o conversor (que mede a escala nos TITULARES) e o teste.
*/
function escolherOnzeDaFormacao(plantel, posicoes) {
    if (!plantel || !posicoes || plantel.length < posicoes.length) return null;

    const pares = [];
    for (let s = 0; s < posicoes.length; s++) {
        for (let j = 0; j < plantel.length; j++) {
            const pb = plantel[j].pb || {};
            const nota = (typeof pb[posicoes[s]] === 'number') ? pb[posicoes[s]] : 0;
            pares.push({ s: s, j: j, nota: nota });
        }
    }
    pares.sort((a, b) => (b.nota - a.nota) || (a.s - b.s) || (a.j - b.j));

    const onze = new Array(posicoes.length).fill(null);
    const usados = new Set();
    let porPreencher = posicoes.length;
    for (const par of pares) {
        if (porPreencher === 0) break;
        if (onze[par.s] || usados.has(par.j)) continue;
        onze[par.s] = plantel[par.j];
        usados.add(par.j);
        porPreencher--;
    }
    return onze.every(x => x) ? onze : null;
}

/*
OS PLAYING STYLES JÁ VÊM NOS DADOS — e são o mesmo catálogo.

O ficheiro traz `playingStyle` em camelCase (`offensiveFullBack`), o motor
tem as mesmas chaves em snake_case (ver PlayingStyles em tactics.js). Só há
tradução a fazer, e não um mapa de equivalências inventado.

Ficam de fora os que o motor não tem; nesses o `aplicarPlayingStyle` cai no
`EstiloPorOmissao` da posição, como já fazia antes de existirem dados.
*/
const EstiloJsonParaMotor = {
    offensiveGoalkeeper: 'offensive_gk',
    ooffensiveGoalkeeper: 'offensive_gk',   // gralha que existe mesmo nos dados
    defensiveGoalkeeper: 'defensive_gk',
    theDestroyer: 'the_destroyer',
    creativePlaymaker: 'creative_playmaker',
    buildUp: 'build_up',
    goalPoacher: 'goal_poacher',
    roamingFlank: 'roaming_flank',
    offensiveFullBack: 'offensive_fullback',
    defensiveFullBack: 'defensive_fullback',
    fullBackFinisher: 'fullback_finisher',
    holePlayer: 'hole_player',
    extraFrontman: 'extra_frontman',
    boxToBox: 'box_to_box',
    anchorMan: 'anchor_man',
    prolificWinger: 'prolific_winger',
    classicNo10: 'classic_no10',
    orchestrator: 'orchestrator',
    dummyRunner: 'dummy_runner',
    foxInTheBox: 'fox_in_the_box',
    targetMan: 'target_man',
    crossSpecialist: 'cross_specialist'
};

/*
Aplica um dos mapas acima a um jogador do ficheiro de dados. Pura: recebe o
registo e devolve o número, sem tocar em nada.

Campos que faltem no registo são ignorados — o peso deles sai da conta em vez
de entrar como zero, senão um campo em falta baixava a skill toda.
*/
function skillDeAtributos(registo, pesos) {
    if (!registo || !pesos) return null;
    let soma = 0, total = 0;
    for (const campo in pesos) {
        const peso = pesos[campo];
        if (!peso) continue;
        const v = Number(registo[campo]);
        if (!isFinite(v)) continue;
        soma += v * peso;
        total += peso;
    }
    if (total <= 0) return null;
    return Math.max(1, Math.min(100, Math.round(soma / total)));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SkillMap, SkillCalib, PosicaoPorIndice, PbPorPos, EstiloJsonParaMotor,
        skillDeAtributos, calibrarSkill, escolherOnzeDaFormacao
    };
}
