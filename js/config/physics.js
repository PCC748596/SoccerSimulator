/*
=============================================================================
CONFIG: FÍSICA E CAMPO
=============================================================================
Dimensões da baliza, campo, redes, barreiras, física da bola e bandeiras.
=============================================================================
*/

/*
ALTURA_BASE_Y — a altura a que o corpo do jogador assenta.

Era 0.0 e o boneco lia-se a pairar: medido em jogo corrido, o ponto mais baixo
do corpo estava mais de 5 cm acima do relvado em 36% das leituras. Vem da
POSE — o `ressalto` da passada mais o `altura` dos keyframes das accoes, que
vai a +0.15 m — e nao de um erro de posicionamento.

Tentou-se resolver a serio, medindo a sola e assentando o corpo frame a frame.
Mexia na animacao e ficou pior; foi desfeita por inteiro. O que fica e o que o
pedido pede: um DESNIVEL CONSTANTE. A animacao e exactamente a de sempre, o
boneco e que assenta tres centimetros mais abaixo.

E a base de tudo no jogador — posicao, alvos, alcance da cabeca
(`ALTURA_BASE_Y + ALTURA_TESTA`) — portanto o corpo desce inteiro e coerente.
Mexer neste numero e mexer na altura de toda a gente, que e a ideia.
*/
const LARGURA_BALIZA = 7.32; const ALTURA_BALIZA = 2.44; const ALTURA_BASE_Y = -0.03;

/*
Rede da baliza — forma e comportamento.

A rede DESENHADA é inclinada: o pano de cima entra `profTopo` metros a partir
da linha, e daí desce em diagonal até ao chão a `profBase` metros (ver a
criação das faces em match.js). A COLISÃO, essa, era uma caixa: parava a bola
a 2.3 m de profundidade a qualquer altura. Uma bola entrada por cima ficava
suspensa muito atrás do pano — lia-se como a bola a atravessar a rede.

E o que havia a seguir era pior para a leitura: `ballVel.set(0,0,0)`. A bola
congelava no ar onde tocasse, em vez de escorregar pelo pano abaixo.

`restituicao` é baixa de propósito — corda amortece quase tudo. `atrito`
trava o deslizamento sem o impedir: é ele que faz a bola descer o pano em vez
de ficar colada onde bateu.
*/
const GoalNet = {
    /*
    FÍSICA — não mexer sem medir. A bola já bate no pano, perde velocidade e
    escorrega até ao chão pela inclinação do pano de trás (profTopo 0.8 no
    cimo, profBase 2.0 na base). Ver Match.colidirComRede em match.js.
    */
    profTopo: 0.8,
    profBase: 2.0,
    restituicao: 0.02,
    atrito: 0.35,

    /*
    MALHA — quantos quadrados por face. Antes cada face era UM quad de quatro
    vértices, e por isso a rede não podia deformar-se: era uma chapa rígida com
    textura de rede. Os laterais são estreitos e levam menos divisões ao longo
    de u.
    */
    segmentosU: 16,
    segmentosV: 6,
    segmentosLateralU: 8,

    /*
    ONDULAÇÃO (ver NetWave em goal_net.js). O deslocamento é ao longo da normal
    da face:

        desloc = amplitude * envolvente(t) * sin(frequencia*t + k*(u+v))
        envolvente(t) = (1 - e^(-t/ataqueOnda)) * e^(-t/tau)

    com tau = duracaoOnda/4, o que deixa ~1.8% da amplitude ao fim de
    duracaoOnda. `ondasPorPano` é quantas cristas cabem na diagonal do pano: é
    o que faz a ondulação PERCORRER a rede em vez de a levantar em bloco.

    O factor de ATAQUE existe para a envolvente valer 0 em t=0. Sem ele a
    envolvente arrancava em 1 e, como a fase depende de (u+v), a rede saltava
    para uma posição já deformada no primeiro frame em vez de partir do
    repouso — apanhado pelos testes.
    */
    ataqueOnda: 0.05,
    duracaoOnda: 5.0,
    amplitudeMax: 0.28,
    frequencia: 7.0,
    ondasPorPano: 2.5,
    velocidadeCheia: 22.0
};

/*
Estrutura da baliza — postes e travessão como obstáculos físicos.

A bola atravessava-os: não havia colisão nenhuma com a armação, só a
detecção de golo (que continua a exigir a bola INTEIRA para lá da linha) e o
clamp da rede. Uma bola na trave passava ou encostava sem ressaltar.

`z` é o plano dos postes: a armação está meio raio para dentro da linha,
como no desenho da baliza (ver criação em match.js).
*/
const GoalFrame = {
    raioPoste: 0.06,
    // Trave e postes são rígidos: devolvem bem mais do que a rede, um pouco
    // menos do que uma parede perfeita.
    restituicao: 0.65,
    // Atrito tangencial no ressalto: a bola sai da trave a rodar e perde
    // alguma velocidade no plano do impacto.
    atrito: 0.85
};

window.Config = {
    usePlayingStyles: true,

    /*
    Público no estádio. LIGADO.

    Esteve a `false` desde que o público antigo (`createSpectatorGeometry` +
    shader de animação por vértice) foi considerado caro de mais — e ficou
    assim, o que fazia os adeptos simplesmente não aparecerem.

    O sistema actual (js/crowd.js) é outra coisa: 15 000 adeptos em QUATRO
    InstancedMesh estáticos, sem shader e sem update por frame. Para desligar
    em jogo há o botão *Fans* no painel direito, que é onde essa decisão deve
    ser tomada; este flag fica como interruptor de arranque.
    */
    enableCrowd: true
};

/*
MULTIPLICADORES DE TENDÊNCIA POR POSIÇÃO
Permite separar a "capacidade técnica" da "mentalidade". 
Por exemplo, um CF com passe 80 prefere chutar do que passar, enquanto um CM com o mesmo atributo prefere o passe.
*/
/*
`driveSpace` (novo) é a CONDUÇÃO PARA O ESPAÇO VAZIO de frente para a baliza —
não é o drible, que é passar por um homem. Relato: "não é possível que ele
receba uma bola sem marcação à frente e não dispare para chutar para o gol".

Um ponta-de-lança que recebe de frente com relva à frente arranca; um médio
defensivo, na mesma posição, levanta a cabeça e passa. É esse o eixo. Entra no
orçamento de condução, no espaço que ele exige para arrancar e na fronteira do
`CarryModel.conduzirSoAcimaDe` — ver `campoAberto` (player_bt.js).
*/
window.PositionalTendencies = {
    'CB': { shoot: 0.50, dribble: 0.40, pass: 1.00, forwardPass: 0.80, cross: 0.20, clearance: 1.30, driveSpace: 0.45 },
    'LB': { shoot: 0.60, dribble: 0.80, pass: 1.00, forwardPass: 0.90, cross: 1.30, clearance: 1.10, driveSpace: 0.85 },
    'RB': { shoot: 0.60, dribble: 0.80, pass: 1.00, forwardPass: 0.90, cross: 1.30, clearance: 1.10, driveSpace: 0.85 },
    'DM': { shoot: 0.70, dribble: 0.70, pass: 1.30, forwardPass: 1.10, cross: 0.50, clearance: 1.10, driveSpace: 0.60 },
    'CM': { shoot: 0.80, dribble: 0.90, pass: 1.20, forwardPass: 1.20, cross: 0.80, clearance: 0.90, driveSpace: 0.95 },
    'LM': { shoot: 0.80, dribble: 1.10, pass: 1.10, forwardPass: 1.10, cross: 1.30, clearance: 0.80, driveSpace: 1.20 },
    'RM': { shoot: 0.80, dribble: 1.10, pass: 1.10, forwardPass: 1.10, cross: 1.30, clearance: 0.80, driveSpace: 1.20 },
    'AM': { shoot: 1.00, dribble: 1.10, pass: 1.10, forwardPass: 1.40, cross: 0.90, clearance: 0.50, driveSpace: 1.35 },
    'LW': { shoot: 1.10, dribble: 1.30, pass: 0.90, forwardPass: 1.00, cross: 1.40, clearance: 0.40, driveSpace: 1.55 },
    'RW': { shoot: 1.10, dribble: 1.30, pass: 0.90, forwardPass: 1.00, cross: 1.40, clearance: 0.40, driveSpace: 1.55 },
    'CF': { shoot: 1.40, dribble: 1.10, pass: 0.70, forwardPass: 0.80, cross: 0.50, clearance: 0.30, driveSpace: 1.60 },
    'ST': { shoot: 1.40, dribble: 1.10, pass: 0.70, forwardPass: 0.80, cross: 0.50, clearance: 0.30, driveSpace: 1.60 },
    'GK': { shoot: 0.10, dribble: 0.10, pass: 1.00, forwardPass: 1.00, cross: 0.10, clearance: 1.50, driveSpace: 0.10 }
};

/*
=============================================================================
A POSIÇÃO DÁ A MENTALIDADE, O ATRIBUTO DÁ O JOGADOR
=============================================================================
Pedido: "cada posição tem que ter um multiplicador de acções específico,
juntamente com as características dos jogadores; senão todos os jogadores vão
fazer a mesma coisa nos jogos".

A tabela acima é por POSIÇÃO, e só por posição: dois pontas-de-lança do mesmo
plantel decidem exactamente igual. Isto acrescenta o segundo eixo — o atributo
do jogador — sem tocar na tabela:

    multiplicador = tendência da posição × (1 + (atributo - 50)/50 × peso)

O atributo é escolhido por acção (rematar lê FIN, conduzir lê PAC, passar lê
PASS...) e o `peso` diz quanto ele pesa. A 50 o atributo é neutro: a tabela
por posição fica como está e nada muda para quem não tem skills carregadas.

`min`/`max` são cortes duros: um extremo rápido não pode transformar um
multiplicador de 1.55 num número que anule tudo o resto.
*/
/*
Os atributos são os que o `data/player_skills.js` traz mesmo — gk, tec,
marking, speed, strength, pass, intercept, tacticknow. Inventar aqui um 'FIN'
ou um 'PAC' não dá erro nenhum: o `skillFor` cai no genérico da função (o mesmo
valor para todos) e o segundo eixo desaparecia em silêncio, que é exactamente
o que se está a corrigir.
*/
window.TendenciaPorAtributo = {
    shoot:       { skill: 'tec', peso: 0.35 },
    dribble:     { skill: 'tec', peso: 0.40 },
    // Conduzir para o espaço é corrida com bola: quem é rápido arranca.
    driveSpace:  { skill: 'speed', peso: 0.45 },
    pass:        { skill: 'pass', peso: 0.25 },
    // Passe para a frente é leitura de jogo, não é o pé.
    forwardPass: { skill: 'tacticknow', peso: 0.35 },
    cross:       { skill: 'pass', peso: 0.35 },
    clearance:   { skill: 'strength', peso: 0.20 },
    min: 0.15,
    max: 2.20
};

window.getPositionalTendency = function (pos, action) {
    if (typeof PositionalTendencies !== 'undefined' && PositionalTendencies[pos]) {
        if (typeof PositionalTendencies[pos][action] === 'number') {
            return PositionalTendencies[pos][action];
        }
    }
    return 1.0;
};

/*
O multiplicador COMPLETO: posição × atributo do jogador. Recebe o jogador, não
a posição, porque é dele que sai a skill. Um jogador sem skills (ou uma acção
sem atributo associado) devolve exactamente o `getPositionalTendency`, para
nada mudar onde ainda não se ligou o segundo eixo.
*/
window.tendenciaDeAccao = function (p, action) {
    const base = window.getPositionalTendency(p && p.pos, action);
    const T = window.TendenciaPorAtributo;
    if (!T || !T[action] || !p || typeof p.skillFor !== 'function') return base;

    const skill = p.skillFor(T[action].skill);
    if (typeof skill !== 'number' || !isFinite(skill)) return base;

    const f = base * (1 + ((skill - 50) / 50) * T[action].peso);
    return Math.max(T.min, Math.min(T.max, f));
};


/*
Altura da TESTA acima da base do modelo.

`model.position` está nos PÉS (y = ALTURA_BASE_Y). O rig, à escala 1.8/5.5,
põe o centro da cabeça a ~1.64 m e a testa a ~1.75 m. Este valor é o ponto de
contacto de um cabeceio — ver distanciaAoCorpo() em utils.js.
*/
/*
=============================================================================
PROPORÇÃO DO CORPO, EM CABEÇAS
=============================================================================
O cânone de desenho mede a figura em alturas de cabeça, do queixo ao topo do
crânio. Este modelo nasceu com 5.04 — uma proporção de banda desenhada, cabeça
grande. Sete é a proporção heróica, a de um atleta desenhado.

AS DUAS MEDIDAS SÃO DO MODELO, medidas e não estimadas (`construirBody` em
pose.js, com as caixas somadas):

    do pé ao queixo         4.543 unidades locais
    do queixo ao cabelo     1.125 unidades locais   (a cabeça inteira)

E a conta que sai delas, para N cabeças:

    cabeca·k = (corpo + cabeca·k) / N     =>     k = corpo / ((N-1)·cabeca)

    N = 7      k = 4.543 / (6 x 1.125)   = 0.673
    N = 5.04   k = 1.000                 <- reproduz o modelo como estava

A segunda linha é a prova da fórmula: pôr `cabecas: 5.04` devolve o modelo
original sem tocar em mais nada.

A ALTURA TOTAL NÃO MUDA. Encolher a cabeça encurtaria o boneco, e é por isso
que o `ESCALA_CORPO` (pose.js) passa a sair daqui: reescala o corpo todo para
a altura ficar nos `alturaAlvo`. Isso é o que mantém válidos os dois números
mais abaixo — o topo da cabeça e a testa continuam onde estavam, porque o
boneco continua com a mesma altura. Sem essa compensação, 25 sítios que usam
`ALTURA_TESTA`/`ALTURA_CABECA` passavam a medir uma cabeça que já não está lá.
=============================================================================
*/
const ProporcaoCorpo = {
    cabecas: 5.5,
    // Medidas do modelo, em unidades locais.
    corpoAteQueixo: 4.543,
    cabecaCheia: 1.125,
    // Altura do jogador em metros, que a escala do corpo mantém.
    alturaAlvo: 1.855,

    // k da fórmula acima: quanto a cabeça encolhe (1.0 = como nasceu).
    get escalaCabeca() {
        const n = Math.max(1.5, this.cabecas);
        return this.corpoAteQueixo / ((n - 1) * this.cabecaCheia);
    },
    // Unidades locais do modelo inteiro, já com a cabeça escalada.
    get totalLocal() {
        return this.corpoAteQueixo + this.cabecaCheia * this.escalaCabeca;
    }
};
if (typeof window !== 'undefined') window.ProporcaoCorpo = ProporcaoCorpo;

/*
=============================================================================
A ALTURA DE CADA JOGADOR — 1.60 a 2.00 m, média 1.75
=============================================================================
Todos mediam o mesmo (1.855 m). Passa a haver variação, com a regra do pedido:

    guarda-redes, centrais e pontas-de-lança de referência   mais altos
    os mais rápidos                                          mais baixos
    os restantes                                             ~1.75

A conta parte de `media` e soma duas parcelas, uma do POSTO e outra do
ATRIBUTO, e no fim corta em [`min`, `max`]:

    altura = media + bonusPosto[pos] + bonusVelocidade(speed) + ruido

`bonusVelocidade` é NEGATIVO e cresce com a velocidade: a 50 de SPEED não
mexe, a 100 tira `penalVelocidade`. É o "os mais rápidos são mais baixos" sem
proibir um extremo alto — um ponta rápido e alto continua possível, só é raro.

O RUÍDO é por jogador e determinístico (sai do `id`, ver `alturaDoJogador` em
utils.js): dois jogadores do mesmo posto e da mesma velocidade não podem medir
exactamente o mesmo, e a altura não pode mudar entre frames nem entre jogos.

ATENÇÃO AO QUE DEPENDE DISTO. O `ALTURA_TESTA` e o `ALTURA_CABECA` abaixo são
absolutos em metros e valiam para um boneco de 1.855 m. Com alturas
diferentes, quem os usa tem de usar a versão POR JOGADOR — ver
`alturaTestaDe`/`alturaCabecaDe` em utils.js, que escalam estes valores pela
altura de cada um. As constantes ficam como a referência da altura padrão e
como recurso onde não há jogador em contexto.
=============================================================================
*/
// A altura do boneco de referência, de que ALTURA_TESTA/ALTURA_CABECA são
// medidas. As alturas por jogador escalam a partir dela.
const ALTURA_PADRAO = 1.855;
if (typeof window !== 'undefined') window.ALTURA_PADRAO = ALTURA_PADRAO;

const AlturaJogador = {
    activo: true,
    /*
    O NOMINAL NÃO É O REALIZADO, e por isso está em 1.795 e não em 1.75.

    A média pedida é 1.75. Mas as parcelas não são simétricas sobre os
    plantéis reais: os postos altos somam mais do que os baixos subtraem, o
    SPEED é enviesado para cima (mediana 84 contra média 82.4) e o piso de
    1.60 corta a cauda de baixo. Com `media: 1.75` a média REALIZADA saía em
    1.712.

    Calibrado contra os 22 jogadores dos plantéis (data/squads.js):

        nominal 1.78  ->  realizada 1.738
        nominal 1.79  ->  realizada 1.747
        nominal 1.80  ->  realizada 1.756

    1.795 fica em 1.75 realizada, que é o pedido. Com outros plantéis a média
    realizada muda — é uma propriedade da amostra, não do modelo, e quem os
    trocar deve voltar a medir em vez de confiar neste número.
    */
    media: 1.795,
    min: 1.60,
    max: 2.00,

    /*
    O bónus do POSTO. Só os três grupos do pedido saem da média; os outros
    ficam a zero de propósito, para "os demais têm alturas médias de 1.75"
    ser o que o código faz e não uma aproximação.
    */
    bonusPosto: {
        GK: 0.13,
        CB: 0.10,
        // Ponta-de-lança de referência: o posto sozinho não o diz, o ESTILO
        // sim (ver `bonusEstilo`). CF e SS ficam neutros.
        CF: 0.0, SS: 0.0
    },
    /*
    E o ESTILO, para o "atacante target". `target_man` é quem joga de costas
    para a baliza e disputa a bola no ar; é ele que é alto, não o ponta que
    corre para as costas da defesa.
    */
    bonusEstilo: {
        target_man: 0.11,
        // Estes vivem do arranque e do espaço curto: ficam baixos.
        goal_poacher: -0.03,
        dummy_runner: -0.03
    },

    /*
    O TERMO DA VELOCIDADE É CENTRADO, e a referência está MEDIDA.

    Era `(vel - 50) / 50`, ou seja centrado em 50 — e mediu-se o SPEED dos
    plantéis reais (data/squads.js): mínimo 66, média 82.4, máximo 94, desvio
    8.7. NINGUÉM está abaixo de 50, portanto todos perdiam altura e ninguém
    ganhava: a média das alturas saía em 1.673 m em vez de 1.75.

    Centrado na média do SPEED, o rápido perde e o lento ganha, e a média das
    alturas volta a ser a `media` pedida. `velocidadeRef` é essa média medida;
    `velocidadeSpan` é o desvio que vale `penalVelocidade` inteiro.
    */
    velocidadeRef: 82,
    velocidadeSpan: 12,
    penalVelocidade: 0.075,

    /*
    A dispersão que faz a faixa chegar aos extremos pedidos (1.60 a 2.00).

    Com sigma 0.045 o mais alto do lote media 1.79 e o intervalo nunca se
    usava. 0.075 é o que abre a faixa: um central lento com ruído positivo
    passa dos 1.95, um lateral rápido com ruído negativo bate no piso.
    */
    sigma: 0.075
};
if (typeof window !== 'undefined') window.AlturaJogador = AlturaJogador;

const ALTURA_CABECA = 1.72;

/*
ALTURA DA TESTA — onde a bola bate num cabeceio.

Toda a decisão de cabeceio mede-se a partir daqui, e também a POSIÇÃO em que a
bola é colada no frame do contacto (executeHeader, js/player.js): sem salto a
testa está a esta altura; a saltar, a esta altura mais a subida do salto.

MEDIDO NO RIG, e não deduzido de `ALTURA_CABECA`. Com o modelo de pé, os
nós e as caixas do rig (criarModelo, js/pose.js) ficam assim acima dos pés:

    pescoço (nó `neck`)   1.45
    queixo (base do crânio) 1.47
    centro da cabeça       1.63
    olhos                  1.66 .. 1.71
    TESTA                  1.71 .. 1.79   (entre os olhos e o cabelo)
    topo do crânio         1.79

Estava `ALTURA_CABECA - 0.10` = 1.62, na suposição de que 1.72 era o topo do
crânio e a testa um pouco abaixo. 1.72 não é o topo (1.79 é), portanto 1.62
caiu à altura da BOCA — e a janela de contacto, ± essa altura, descia até 1.40,
por baixo do queixo. Relato: *"os jogadores estão a cabecear a bola no
pescoço"*. Era literal: o `executeHeader` colava a bola a 1.62 sempre, dez
centímetros abaixo dos olhos.
*/
const ALTURA_TESTA = 1.74;
const CAMPO_LARG = 68; const CAMPO_COMP = 106;
const LINHA_FUNDO = CAMPO_COMP / 2;          // 53.0 m (distância do centro a cada linha de fundo)
const MEIA_LARGURA_CAMPO = CAMPO_LARG / 2;   // 34.0 m (distância do centro a cada linha lateral)

/*
=============================================================================
GEOMETRIA DAS ÁREAS DO CAMPO
=============================================================================
Centralização das dimensões e predicados das áreas (grande e pequena área),
para evitar dispersão de números mágicos (16.5, 20.16, 5.5, 9.16) e duplicidade
de lógicas de contenção.
=============================================================================
*/
const Area = {
    profundidade: 16.5,          // da linha de fundo para dentro
    meiaLargura: 20.16,          // do eixo do campo para cada lado
    largura: 40.32,              // largura total (2 * meiaLargura)
    pequenaProfundidade: 5.5,    // profundidade da pequena área a partir da linha de fundo
    pequenaMeiaLargura: 9.16,    // LARGURA_BALIZA / 2 + 5.5 (7.32/2 + 5.5 = 9.16)
    pequenaLargura: 18.32,       // largura total da pequena área
    distanciaPenalti: 11.0,      // marca de penálti a partir da linha de fundo
    raioMeiaLua: 9.15,           // raio do arco da grande área

    /*
    Verifica se um ponto (x, z) está dentro da grande área.
    - Se ladoZ for fornecido (+1, -1, ou z da linha de fundo ex.: ±53):
      avalia em relação à baliza específica indicada.
    - Se ladoZ for omitido/nulo: avalia se está em QUALQUER uma das duas grandes áreas.
    */
    contem: function (x, z, ladoZ) {
        if (Math.abs(x) > this.meiaLargura) return false;
        if (ladoZ !== undefined && ladoZ !== null) {
            const sinal = Math.sign(ladoZ) || 1;
            const dz = (sinal * LINHA_FUNDO - z) * sinal;
            return dz >= 0 && dz <= this.profundidade;
        }
        const dz = LINHA_FUNDO - Math.abs(z);
        return dz >= 0 && dz <= this.profundidade;
    },

    /*
    Verifica se um ponto (x, z) está dentro da pequena área (área de meta).
    */
    contemPequena: function (x, z, ladoZ) {
        if (Math.abs(x) > this.pequenaMeiaLargura) return false;
        if (ladoZ !== undefined && ladoZ !== null) {
            const sinal = Math.sign(ladoZ) || 1;
            const dz = (sinal * LINHA_FUNDO - z) * sinal;
            return dz >= 0 && dz <= this.pequenaProfundidade;
        }
        const dz = LINHA_FUNDO - Math.abs(z);
        return dz >= 0 && dz <= this.pequenaProfundidade;
    }
};

/*
Aliases para manter compatibilidade com módulos existentes.
*/
const AREA_GRANDE_PROF = Area.profundidade;
const AREA_GRANDE_MEIA_LARG = Area.meiaLargura;

if (typeof window !== 'undefined') {
    window.Area = Area;
    window.LINHA_FUNDO = LINHA_FUNDO;
    window.MEIA_LARGURA_CAMPO = MEIA_LARGURA_CAMPO;
    window.AREA_GRANDE_PROF = AREA_GRANDE_PROF;
    window.AREA_GRANDE_MEIA_LARG = AREA_GRANDE_MEIA_LARG;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();
const _line1 = new THREE.Line3();
const _vUp = new THREE.Vector3(0, 1, 0);   // eixo vertical, para rodar direcções no plano do campo
const _vFrenteCorpo = new THREE.Vector3();  // frente local (+Z) do jogador que passa, para o ângulo do corpo no erro do passe (executePassGameplay)
const _vDireitaCorpo = new THREE.Vector3(); // direita local (+X) do jogador, para detecção de recepções laterais

/*
=============================================================================
FÍSICA DA BOLA — valores reais, não afinados à mão
=============================================================================
O que estava antes em updateBall(), e porque estava errado:

    gravidade   15.0 m/s²        53% acima da real; a bola caía como pedra
    raio        0.15 m           circunferência 94 cm (regulamento: 68-70)
    arrasto     pow(0.85, dt)    decaimento EXPONENCIAL, proporcional a v e
                                 só em x/z. O arrasto real é quadrático (∝v²)
                                 e trava as três componentes: com o modelo
                                 antigo uma bola lenta perdia 15%/s (a mais)
                                 e uma bola a 30 m/s quase não travava (a
                                 menos). Daí o voo "esquisito".
    chão        pow(0.55, dt)    45% da velocidade por segundo a rolar. Uma
                                 bola a rolar perde ~1 m/s por segundo, e
                                 essa perda é constante (μ·g), não uma
                                 fracção da velocidade.

Valores agora:
    massa 430 g          FIFA Lei 2 (410-450 g)
    circunferência 69 cm FIFA Lei 2 (68-70 cm) → raio 0.11 m
    ρ = 1.225 kg/m³      ar seco, 1 atm (101 325 Pa), nível do mar, 15 °C
    Cd = 0.25            bola de futebol em regime turbulento
    g = 9.81 m/s²

    arrasto:    a = ½·ρ·Cd·A/m · v²  =  0.0135·v²
                (0.34 m/s² a 5 m/s; 12.2 m/s² a 30 m/s)
    rolamento:  a = μ·g = 0.98 m/s², constante
=============================================================================
*/
const BallPhysics = {
    massa: 0.430,           // kg
    raio: 0.11,             // m (circunferência 69 cm)
    gravidade: 9.81,        // m/s²
    densidadeAr: 1.225,     // kg/m³ — 1 atm, nível do mar, 15 °C
    cd: 0.25,               // coeficiente de arrasto
    restituicao: 0.60,      // ressalto vertical em relva
    atritoRessalto: 0.75,   // perda horizontal em cada ressalto
    atritoRolamento: 0.38,  // μ de rolamento em relva
    vMinRessalto: 0.6,      // abaixo disto não ressalta, assenta
    vMinRolar: 0.25,        // abaixo disto pára de vez

    /*
    Só a MALHA é aumentada, não a física: a bola regulamentar (raio 0.11 m)
    fica pequena de mais para se ver bem à distância da câmara. O raio de
    colisão, o ressalto e a rotação continuam a usar o valor real.
    */
    escalaVisual: 1.30
};

/*
=============================================================================
BARREIRA DO CAMPO — muro de contenção à frente da bancada
=============================================================================
Sem isto, uma bola forte para fora saía do estádio e ia rolar por baixo das
bancadas até parar sozinha (a física real tem pouco atrito de rolamento e o
`resetPlay` só acontece depois de ela parar).

As bancadas laterais começam em |x| = 38.5 e as de fundo em |z| = 58.5 (ver
createField). A barreira fica logo à frente delas, com a folga do degrau.

A contenção aplica-se a QUALQUER altura da bola, embora o painel só suba
`alturaPainel`: acima disso é a rede de protecção (a parte translúcida), que
existe pela mesma razão nos estádios a sério.
=============================================================================
*/
const BarreiraCampo = {
    /*
    A BARREIRA É A BANCADA, e não um muro invisível à frente dela.

    Relato: "quando a bola sai ela bate numa barreira invisível atrás do gol;
    pode deixar a bola bater na arquibancada mesmo".

    Estava a 4 m das linhas. As bancadas (ver createField, match_setup.js)
    começam a `CAMPO_LARG/2 + 4.5` de lado e a `CAMPO_COMP/2 + 5.5` atrás das
    balizas — ou seja, a bola parava meio metro a um metro e meio ANTES do
    primeiro degrau, no ar, sem nada lá. Agora bate onde a bancada está.

    Os números vêm das mesmas contas do `createField`: se as bancadas se
    mudarem, isto muda com elas.
    */
    x: (CAMPO_LARG / 2) + 4.5,
    z: (CAMPO_COMP / 2) + 5.5,

    alturaPainel: 1.1,      // muro de publicidade, opaco
    alturaRede: 4.5,        // rede de protecção por cima, translúcida

    /*
    E TEM ALTURA. Antes o teste era só em x/z: uma bola a 15 m de altura
    ressaltava contra o mesmo muro invisível, no meio do ar. Acima da rede
    passa por cima, como no estádio — e não se perde nada, porque a bola já
    saiu e o lance é reposto pelo árbitro.
    */
    alturaMax: 1.1 + 4.5,

    restituicao: 0.35,      // ressalto seco: a bola morre ali, não volta ao meio
    atrito: 0.6             // perda na componente paralela ao embate
};
BallPhysics.area = Math.PI * BallPhysics.raio * BallPhysics.raio;
// ½·ρ·Cd·A/m — multiplicar por v² dá a desaceleração em m/s².
BallPhysics.kArrasto = 0.5 * BallPhysics.densidadeAr * BallPhysics.cd *
    BallPhysics.area / BallPhysics.massa;

/*
Sincronização gameplay↔animação (ActionState, ver js/bt/action_state.js).
contactTime é a fracção (0..1) da duração do gesto em que o efeito real
(bola sai do pé, etc.) dispara — não no instante em que o BT decide.
Começa só pelo PASS; os valores replicam exactamente o timing antigo
(this.timer<0.08 / >=0.2) para não mudar o "feel" ao migrar de arquitectura.
*/

/*
=============================================================================
AS DUAS CORES DO RELVADO
=============================================================================
As faixas do corte alternam entre estes dois tons — `clara` é a faixa que o
rolo deixou a favor da luz, `escura` a do sentido contrário. Estavam escritas à
mão dentro do `createField` (match_setup.js), a meio da construção da textura, e
eram dois `#hex` soltos que ninguém encontrava sem saber onde procurar.

TROCAR O VERDE É TROCAR ESTAS DUAS LINHAS. A textura é gerada num canvas de
16x512 e o resto (o número de faixas, a largura de cada uma, a repetição)
não depende da cor.

Os valores actuais vieram de duas amostras dadas pelo utilizador. Se o tom não
bater certo com a amostra, é aqui — e só aqui.
*/
const RelvaCores = {
    /*
    A CLARA ESTAVA LIMÃO, e o problema era o MATIZ e não o brilho.

    Relato: *"escurece um pouco o verde claro do campo, está muito verde
    limão"*. Medidas as duas faixas:

        clara  #6E9B37   rgb 110,155,55   matiz  87   luminancia 138
        escura #4E8F3C   rgb  78,143,60   matiz 107   luminancia 123

    87 graus é amarelo-verde — é daí que vem o limão. A faixa ESCURA já estava
    a 107, verde a sério; eram as duas de cores diferentes e não a mesma cor em
    dois brilhos.

    #5A9638 leva a clara a 98 graus (a meio caminho da escura) e desce a
    luminância de 138 para 130. Continua 7 pontos acima da escura, que é o que
    mantém as faixas do corte visíveis — escurecer até igualar apagava-as.

    Uma tentativa anterior mexeu só no brilho (#618830) e foi revertida a
    pedido: o tom continuava amarelo, só mais escuro.
    */
    clara: '#5A9638',    // a faixa a favor do corte
    escura: '#4E8F3C'    // a do sentido contrário
};
if (typeof window !== 'undefined') window.RelvaCores = RelvaCores;

/*
=============================================================================
PLACAS DE PUBLICIDADE — a cintura que fecha o recinto
=============================================================================
Um anel de painéis a toda a volta, `recuo` metros para fora das linhas. Fecha
nos cantos: os painéis laterais correm em z ao longo de todo o comprimento já
esticado pelo recuo, e os de fundo correm em x ao longo da largura esticada,
portanto as quatro pontas encontram-se sem deixar aberturas.

    laterais   x = +-(MEIA_LARGURA_CAMPO + recuo)   comprimento = CAMPO_COMP + 2*recuo
    fundos     z = +-(LINHA_FUNDO + recuo)          comprimento = CAMPO_LARG + 2*recuo

A relva desenhada vai a +-60 em x e +-70 em z (ver `gramaLarg`/`gramaComp` em
match_setup.js); com o recuo a 5 m os painéis ficam a +-39 e +-58, bem dentro
dela. Quem aumentar o recuo tem de esticar a relva também, senão eles ficam a
flutuar fora do tapete.

As cores são blocos genéricos e alternados, sem marca nenhuma: isto é cenário,
não publicidade a sério.
=============================================================================
*/
const PlacasPublicidade = {
    activo: true,
    recuo: 5.0,          // metros para fora das linhas
    altura: 1.0,         // metros
    espessura: 0.08,
    corEstrutura: 0x2b2b30,
    /*
    OS CANTOS SÃO ARREDONDADOS, como os da bancada — pedido.

    A bancada não fecha em esquina: as rectas param a `RAIO_PRIMEIRA_FILA` do
    vértice e um quarto de círculo desse raio fecha o anel (ver
    `buildCorner`/`cornerX`/`cornerZ` no match_setup.js). As placas passam a
    ter a mesma forma, com a mesma conta.

    `raioCanto` é 6.5, o mesmo raio da primeira fila da bancada, para as duas
    curvas serem concêntricas e o recinto ler como um só desenho em vez de um
    rectângulo dentro de um oval.

    A conta que fecha o anel, e que é a mesma da bancada: as rectas vão até
    `canto = (limite - raioCanto)` em cada eixo, e o arco é centrado em
    (+-cantoX, +-cantoZ). As pontas dele caem exactamente em cima das duas
    rectas, em qualquer `recuo` ou `raioCanto` — não há dois números a manter
    a par, que é o erro que a nota da bancada descreve.
    */
    raioCanto: 6.5,
    // Um painel por cada `larguraPainel` metros, em blocos de cor alternados.
    larguraPainel: 4.0,
    cores: ['#1f6fb2', '#e8e8ec', '#c8102e', '#f2c400', '#0f9d58']
};
if (typeof window !== 'undefined') window.PlacasPublicidade = PlacasPublicidade;

/*
=============================================================================
OS CORREDORES DA BANCADA — centrados no meio-campo
=============================================================================
Pedido: *"centraliza a passagem de pessoas nas arquibancadas com a linha
central do campo e aumenta em 1 metro de largura"*.

COMO ERA, e porque é que não estava centrado: os corredores saíam de um módulo
sobre o ÍNDICE da cadeira, contado desde a ponta da bancada —
`if (colIdx % 22 >= 20) continue`. Duas colunas vazias a cada 22, com as
cadeiras a 0.85 m: um corredor de 1.7 m, numa posição que depende de onde a
contagem começa e que não tem relação nenhuma com o meio do campo. Nas
bancadas de fundo o passo era outro (`% 20 >= 18`), portanto os quatro lados
nem concordavam entre si.

COMO É AGORA: a conta é em METROS A PARTIR DO CENTRO. Os corredores ficam em
`k * espacamento` para k inteiro, e o k = 0 cai exactamente na linha central
do campo — em z nas bancadas laterais, em x nas de fundo. Uma cadeira é
saltada quando está a menos de meia largura do centro de um corredor.

A largura passa de 1.7 para 2.7 m, o metro pedido. Em cadeiras isso são ~3
colunas em vez de 2, mas o número de colunas deixa de ser o parâmetro: manda a
largura em metros, e mudar o espaçamento das cadeiras não a estraga.
=============================================================================
*/
const CorredoresBancada = {
    // Largura do corredor, em metros. Era 2 x 0.85 = 1.7.
    largura: 2.7,
    // Distância entre centros de corredores. Era 22 x 0.85 = 18.7 nas
    // laterais e 20 x 0.85 = 17.0 nos fundos; unifica-se nos 18.7.
    espacamento: 18.7
};
if (typeof window !== 'undefined') window.CorredoresBancada = CorredoresBancada;

/*
=============================================================================
TÚNEIS DE ACESSO — as bocas por onde o público entra na bancada
=============================================================================
Pedido, com fotografia: uns túneis nos corredores, pelo décimo degrau.

Ficam nos CORREDORES e não a meio das cadeiras, que é onde estão num estádio
a sério: o corredor é o acesso, e o túnel despeja nele. Por isso a largura sai
do `CorredoresBancada.largura` — se o corredor mudar de largura, a boca
acompanha e não fica um degrau à vista de cada lado.

`degrau` é a fila onde a boca abre. Com 30 filas de 0.5 m de altura e 1.2 m de
profundidade cada, o décimo fica a 5.25 m de altura e 12 m para dentro da
primeira fila — a meia encosta, que é onde as fotografias as mostram.

A boca é uma caixa ESCURA metida para dentro da bancada. Não é um buraco a
sério na geometria: abrir a malha das filas dava um vão por onde se veria o
céu por trás. Uma caixa escura recuada lê-se como a entrada de um túnel e não
precisa de tocar nas filas, que continuam inteiras.
=============================================================================
*/
/*
=============================================================================
BANCADA EM ANEIS — parede e cobertura em cada um
=============================================================================
Pedido, com fotografia de referencia: no vigesimo degrau uma parede de 3 m e
uma cobertura; depois mais 20 degraus, outra parede e outra cobertura.

E o desenho classico de um estadio de dois aneis: cada anel acaba numa parede
(a fachada, onde na fotografia estao os paineis publicitarios), a cobertura do
anel de baixo nasce no topo dessa parede e avanca sobre ele, e o anel seguinte
assenta em cima.

A GEOMETRIA DE UM DEGRAU manda em tudo: 1.2 m de profundidade e 0.5 m de
altura (os `addStepBox` do createField). Dai sai, para o anel `t`:

    profundidade do inicio   t * (degraus * 1.2 + espessuraParede)
    altura do inicio         t * (degraus * 0.5 + alturaParede)

Com 20 degraus e 3 m de parede, o segundo anel comeca a 13 m de altura e 24.6 m
para dentro da primeira fila; o topo dele fica a 23 m e a cobertura de cima a
26 m. Um estadio de dois aneis anda por ai.

`coberturaAvanco` e o quanto o telhado sai para DENTRO do campo a partir da
parede. Nao cobre o anel todo de proposito: na fotografia as primeiras filas
estao a ceu aberto, e e o que deixa a luz entrar no relvado.
=============================================================================
*/
const BancadaAneis = {
    aneis: 2,
    degrausPorAnel: 20,

    alturaParede: 3.0,
    espessuraParede: 0.6,
    corParede: 0x7c8794,      // um betao mais escuro que os degraus

    /*
    ONDE O ANEL DE CIMA COMECA — medido do BORDO da cobertura de baixo.

    Estava errado: o anel de cima nascia atras da parede do de baixo, ou seja
    `degraus*1.2 + espessuraParede` = 24.6 m da primeira fila. Como a cobertura
    avanca 16 m para dentro, o bordo dela esta aos 8 m — e o anel de cima ficava
    **16.6 m atras** dele, empurrado para fora do estadio.

    Num estadio de dois aneis o de cima fica em VOLADURA sobre o de baixo, e a
    cobertura inferior e o piso dele: o bordo do anel de cima quase alcanca o
    bordo da cobertura. `recuoSobreCobertura` e o quanto fica atras desse bordo.

        bordo da cobertura      degraus*1.2 - coberturaAvanco  =  8.0 m
        primeira fila de cima   bordo + recuoSobreCobertura    = 11.0 m
    */
    recuoSobreCobertura: 3.0,

    cobertura: true,
    coberturaAvanco: 16.0,    // metros para dentro do campo, desde a parede
    coberturaEspessura: 0.45,
    corCobertura: 0x5b646e,
    // A face de baixo e mais escura, como um tecto visto de baixo.
    corCoberturaBaixo: 0x3a4149
};
if (typeof window !== 'undefined') window.BancadaAneis = BancadaAneis;

/*
=============================================================================
HOLOFOTES — e com eles o jogo de dia ou a noite
=============================================================================
Pedido: holofotes na frente das coberturas do anel superior, na linha das
laterais, para se poder regular se o jogo e de dia ou a noite.

ONDE FICAM: no bordo da cobertura do ULTIMO anel, so nas duas laterais. Nos
estadios com cobertura os projectores vao presos a essa aresta, virados ao
relvado — nao em torres nos cantos, que e o desenho antigo.

`fileiras` e quantos conjuntos por lateral, espalhados ao longo do
comprimento. `lampadasPorFileira` sao as caixas de cada conjunto.

DIA E NOITE, e o que cada um muda:

    de dia    o sol (`dirLight`) forte, ambiente claro, ceu azul.
              Os holofotes existem e estao APAGADOS — de dia nao se acendem
              projectores, e ve-se a estrutura deles.
    de noite  o sol quase desligado (fica um residuo para as sombras nao
              desaparecerem de todo), ambiente escuro e frio, ceu quase preto,
              e os holofotes acesos a iluminar o relvado.

O `intensidadeLuz` e por lampada e e baixo de proposito: com quatro conjuntos
por lateral sao muitas luzes a somar, e cada uma a 1.0 estouraria o relvado.
=============================================================================
*/
const Holofotes = {
    activo: true,
    // Quantos conjuntos por lateral, e quantas lampadas em cada.
    fileiras: 4,
    lampadasPorFileira: 6,

    // Geometria de uma lampada e da travessa que as segura.
    lampadaLarg: 0.9, lampadaAlt: 0.7, lampadaProf: 0.35,
    espacoEntreLampadas: 1.15,
    travessaEspessura: 0.25,

    corEstrutura: 0x2f3438,
    corLampadaApagada: 0x6b7178,
    corLampadaAcesa: 0xfff6d8,

    /*
    A LUZ. Uma `SpotLight` por conjunto (nao por lampada): seis luzes por
    conjunto seriam 48 luzes na cena, e o custo de uma luz com sombra e alto.
    As lampadas sao geometria; quem ilumina e o conjunto.
    */
    intensidadeLuz: 0.55,
    anguloLuz: 0.75,        // radianos, meio-angulo do cone
    penumbra: 0.4,
    alcanceLuz: 160,
    corLuz: 0xf4f7ff,       // branco ligeiramente frio, como halogeneo

    // O estado do mundo em cada modo.
    dia: {
        solIntensidade: 0.8,
        ambienteIntensidade: 0.45,
        ceu: 0x87CEEB,
        holofotesAcesos: false
    },
    noite: {
        solIntensidade: 0.08,
        ambienteIntensidade: 0.16,
        ceu: 0x0a1018,
        holofotesAcesos: true
    }
};
if (typeof window !== 'undefined') window.Holofotes = Holofotes;

const TunelBancada = {
    activo: true,
    // Era 10; desceu 3 filas a pedido.
    degrau: 7,
    altura: 2.2,          // metros, a boca
    profundidade: 3.0,    // quanto entra para dentro da bancada
    cor: 0x14161a,        // quase preto: e uma sombra, nao uma parede

    /*
    AS TRES FOLGAS QUE IMPEDEM O PISCAR.

    Relato: *"a textura ta piscando, tem que afastar um pouco uma da outra"*. E
    estava, e a conta explica-o: a face da frente da boca ficava 5 cm a frente
    do degrau e a moldura levava so 7 cm, com 12 cm de espessura — ou seja a
    moldura ia de 57.36 a 57.48 e a face do degrau estava a 57.40, DENTRO dela.
    Tres superficies quase no mesmo plano, e o z-buffer nao sabe qual esta a
    frente.

    Agora cada uma tem a sua distancia, e as tres nao se tocam:

        face do degrau      (a bancada)
        + folgaFrente       a face escura da boca
        + folgaMoldura      a moldura, mais a frente de todas

    30 e 12 cm sao folgas grandes de proposito. O z-fighting nao depende so da
    distancia: depende da razao entre ela e a profundidade da camara, e esta
    camara chega a ver a 105 m (ver CameraZoom). Folgas de milimetros voltavam
    a piscar de longe.
    */
    /*
    AS FOLGAS SAO O MINIMO QUE NAO PISCA, e nao mais.

    Estiveram em 0.30 e 0.12, e a moldura ficava 0.48 m a frente da face da
    bancada (0.30 da boca + 0.12 + meia espessura da propria moldura): lia-se
    solta, a flutuar a frente do tunel em vez de o emoldurar. Relato: *"a
    margem da entrada do tunel esta um pouco afastada"*.

    O QUE FAZIA PISCAR NAO ERA A DISTANCIA SER PEQUENA — era a moldura
    ATRAVESSAR a face do degrau, tres planos no mesmo sitio. Sem sobreposicao,
    12 e 5 cm bastam, e a moldura encosta ao tunel como deve.
    */
    folgaFrente: 0.12,
    folgaMoldura: 0.05,

    /*
    A MOLDURA E DA COR DA BANCADA, nao de um cinza proprio.

    Estava em 0x9aa0a6, um cinza inventado a parte. O `concreteMat` das
    bancadas e 0x94a3b8 (ver createField), e a moldura e betao da mesma
    estrutura: com duas cinzas diferentes lado a lado, a moldura lia-se como
    uma peca colada e nao como parte da bancada. Pedido: *"pinta o tunel por
    fora da cor da arquibancada"*.
    */
    moldura: true,
    corMoldura: 0x94a3b8,
    espessuraMoldura: 0.18
};
if (typeof window !== 'undefined') window.TunelBancada = TunelBancada;

const CornerFlag = {
    raioArco: 1.0,        // regulamento
    alturaPoste: 1.5,     // regulamento: minimo 1.5 m
    raioPoste: 0.03,
    corPoste: 0xf5f5f5,
    larguraBandeira: 0.42,
    alturaBandeira: 0.30,
    corBandeira: 0xf2c400
};

/*
=============================================================================
FUNCIONÁRIOS DO ESTÁDIO — o pessoal de laranja em volta do recinto
=============================================================================
Pedido, com fotografia: uns modelos de roupa laranja a toda a volta do campo,
a 1 m da arquibancada e afastados 5 m entre si, e mais alguns em vários pontos
ATRÁS das placas de publicidade.

São dois anéis distintos, e vivem a distâncias diferentes de propósito:

    anel da bancada   `recuoDaBancada` metros à frente da primeira fila, um
                      a cada `espacamento` metros. É a fila de seguranças de
                      costas para o público, que é onde eles estão num estádio.
    grupos das placas `recuoDaPlaca` metros para fora dos painéis (ou seja,
                      entre a publicidade e a bancada), em pequenos grupos e
                      não em fila: ali estão os maqueiros, os apanha-bolas e o
                      pessoal de manutenção, e eles andam aos dois e aos três.

A GEOMETRIA NÃO É COPIADA. O `createField` passa os números que já usou para
construir as bancadas e as placas (`bancadaX`, `cantoX`, `raioPrimeiraFila`,
`placaX`...); mexer no `RECUO_LATERAL` ou no `PlacasPublicidade.recuo` arrasta
o pessoal com eles em vez de os deixar a flutuar no meio do relvado — o erro
que a nota da `BarreiraCampo` descreve.

O anel fecha nas esquinas com o MESMO raio da primeira fila menos o recuo,
centrado em (±cantoX, ±cantoZ): concêntrico com a bancada e com as placas, tal
como elas são entre si.
=============================================================================
*/
const FuncionariosEstadio = {
    activo: true,

    // --- o anel colado à bancada ---------------------------------------
    recuoDaBancada: 1.0,    // metros à frente da primeira fila
    /*
    ESPAÇAMENTO NO ANEL. Esteve em 5 m — o número do pedido inicial — e eram
    85 pessoas a toda a volta, uma parede de coletes: *"funcionários de 5 em 5
    está muito"*. A 12 m são ~35, que é a fila de seguranças de um estádio
    cheio e não um cordão.
    */
    espacamento: 12.0,      // metros entre funcionários ao longo do anel

    /*
    E VIRADOS PARA O CAMPO, com uns graus de folga.

    Sem a folga são oitenta bonecos alinhados ao milímetro, e lê-se como uma
    grelha impressa e não como gente de serviço. `variacaoRotacao` é em
    radianos, o mesmo parâmetro (e a mesma razão) do `CrowdModel`.
    */
    variacaoRotacao: 0.30,

    // --- os grupos atrás das placas ------------------------------------
    grupos: {
        activo: true,
        porLadoLateral: 3,     // quantos grupos em cada lateral
        /*
        ATRÁS DAS BALIZAS SÃO MAIS, e é assim num estádio: o fotógrafo quer a
        cara de quem marca e a bola a entrar, portanto as duas linhas de fundo
        enchem-se e as laterais têm meia dúzia. Pedido: *"pode colocar mais
        repórters atrás dos gols"* — eram 2 grupos (6 pessoas) por fundo.
        */
        porLadoFundo: 5,       // e em cada fundo
        pessoasPorGrupo: 3,
        // Espaço entre duas pessoas do mesmo grupo, ao longo da linha.
        passoNoGrupo: 1.3,
        recuoDaPlaca: 1.4,     // metros para FORA do painel
        /*
        METADE SENTADA. Atrás das placas o pessoal passa o jogo sentado em
        bancos baixos — de pé tapavam a publicidade, que é precisamente o que
        ninguém faz num estádio. Os de pé continuam a existir para o grupo não
        ler como um banco corrido.
        */
        fraccaoSentados: 0.5,
        /*
        O banco por baixo de quem está sentado: uma caixa escura e baixa.

        A ALTURA NÃO ESTÁ AQUI, e é de propósito: sai da própria pose. Na pose
        `sentado` os pés ficam no relvado e a anca a 0.61 m — escrever a altura
        à mão dava um banco que não bate com o corpo em cima dele (ou o boneco
        a flutuar, ou a caixa a sair-lhe pela cintura), e mudar a pose ou a
        escala do corpo obrigava a vir aqui corrigir. Ver `_geometrias` e a
        `alturaAssento` em staff.js.
        */
        banco: { largura: 0.5, profundidade: 0.4, cor: 0x23262b }
    },

    /*
    AS CORES, E SÃO DOIS FARDAMENTOS DIFERENTES.

    O colete é a razão de eles existirem: num estádio o pessoal de serviço
    veste alta-visibilidade exactamente para se distinguir dos jogadores e do
    público. Mas não é o mesmo colete para todos, e a diferença é real:

        anel da bancada   LARANJA, e com as calças todas iguais: é um
                          fardamento, e o que se lê nele é a uniformidade.
        atrás das placas  AMARELO sobre roupa à civil — pedido: *"os grupos de
                          fotógrafos e reportes usa um colete amarelo neles com
                          roupas de cores variadas"*. É o que eles são: não são
                          funcionários do estádio, são imprensa com um colete
                          por cima da sua própria roupa, e por isso as calças
                          saem do baralho `roupasImprensa` em vez de uma cor só.

    `emissiveColete` dá aos dois a leitura de refletor: à noite, com os
    holofotes, um alta-visibilidade só difuso apagava-se e eles desapareciam. É
    um âmbar escuro e serve os dois tons — a cor emissiva é do material (uma
    por malha) e não da instância, portanto um valor mais laranja tingia os
    coletes amarelos, e um mais amarelo tingia os laranja.
    */
    cores: {
        colete: '#ff7a18',
        coleteImprensa: '#ffd91c',
        calcas: '#25272c',
        emissiveColete: '#4a3200',
        /*
        OS SAPATOS SÃO UM CANAL À PARTE, e não a cor das calças: com os pés no
        canal do tecido, um fotógrafo de calças cáqui ficava de sapatos cáqui.
        Escuros nos dois fardamentos — é calçado de trabalho.
        */
        sapatos: '#1b1c1f',
        /*
        A roupa da imprensa. Tons de gente vestida à civil num relvado —
        ganga, cáqui, cinza, verde-escuro, bordô —, e nenhum deles perto do
        equipamento das duas equipas (azul e vermelho vivos): quem está atrás
        da placa não pode ler-se como um jogador a aquecer.
        */
        roupasImprensa: ['#3b4252', '#6b5b45', '#4a4f57', '#2f4034', '#5a3a3a', '#7a7268']
    },

    /*
    Pele, cabelo e altura saem do mesmo baralho dos adeptos (CrowdModel): é a
    mesma gente do mesmo estádio, e ter dois baralhos era garantir que um deles
    ficava a divergir do outro.
    */
    escalaMin: 0.90,
    escalaMax: 1.05,
    variacaoCor: 0.10
};
if (typeof window !== 'undefined') window.FuncionariosEstadio = FuncionariosEstadio;

/*
=============================================================================
GRUAS DE CÂMARA — a lança de televisão atrás de cada baliza
=============================================================================
Pedido, com fotografia: *"qual a chance de colocar uma grua atrás de cada gol
com uma câmera nela?"*. Chance total: é estrutura, não é gente — cinco caixas e
um cilindro por grua, sem rig, sem animação e sem update por frame.

A PRIMEIRA VERSÃO ERA UM MONSTRO, e a fotografia mostrou-o: *"a grua tá
gigante"*. Tinha 5.2 m de pivô e 12 m de lança a atravessar o ar por cima da
baliza — do tamanho de uma grua de obra, e a tapar o que ela existe para
mostrar. O que está na fotografia é uma **jib de televisão**: um carrinho no
chão atrás das placas, uma coluna à altura de um homem, e um braço de cinco
metros com a câmara na ponta.

    E FICA PARALELA À LINHA DE FUNDO, que é a segunda metade do pedido. A lança
    corre em X, ao longo do fundo, atrás das placas — não aponta para dentro do
    campo. É o que a foto mostra e é o que faz sentido: uma jib atrás da baliza
    varre a área de um poste ao outro, e para isso o braço tem de correr ao
    lado da linha e não por cima dela.

A base assenta ao lado do eixo da baliza e a lança aponta para o eixo, com a
CÂMARA a cair em cima dele: o enquadramento clássico de trás da baliza. A
distância a que a base fica do eixo não se escreve — é o alcance da lança, e
sai dela (ver `GruasDeCamera.build`). Ver a vista desta câmara na tecla 8
(`cameraMode` 'grua', match_ui.js), e a lança a subir com a bola em
`GruasDeCamera.update`.

A LANÇA NÃO PODE ENTRAR NO CAMPO: a base está `recuoDaPlaca` metros para fora
dos painéis e o braço corre paralelo à linha, portanto nada disto chega ao
relvado — o `GruasDeCamera.build` (js/staff.js) confirma-o e avisa, em vez de
deixar passar uma lança pendurada sobre a pequena área.
=============================================================================
*/
const GruaDeCamera = {
    activo: true,

    /*
    Onde o carrinho assenta em Z: para fora das placas.

    EM X NÃO HÁ NÚMERO, e é isso que põe a câmara no sítio pedido: *"a câmera
    da grua deve ficar no alinhamento do centro do gol"*. A base tem de ficar
    exactamente ao ALCANCE da lança a contar do eixo, senão a câmara fica
    desalinhada — e o alcance sai do comprimento e da inclinação, que agora
    muda a toda a hora (ver `alturaMin`/`alturaMax`). Um `desvioX` escrito à
    mão era um segundo número a ter de concordar com esses dois; é calculado no
    `GruasDeCamera.build` (js/staff.js).
    */
    recuoDaPlaca: 2.0,

    /*
    AS MEDIDAS SÃO AS DE UMA JIB, e não de uma grua de obra:

        pivô a 2.3 m      a altura de onde o operador a maneja
        lança de 5.5 m    do pivô à câmara
        braço de 1.6 m    o lado do contrapeso

    Eram 5.2 / 12.0 / 3.0. A lança de 12 m punha a câmara a 7 m de altura no
    meio do ar, e de qualquer câmara do jogo lia-se como um andaime.
    */
    baseLargura: 1.1,
    baseAltura: 0.25,
    alturaPivo: 2.3,
    larguraTorre: 0.30,
    comprimentoLanca: 5.5,
    espessuraLanca: 0.18,
    comprimentoContrapeso: 1.6,
    contrapeso: 0.55,

    /*
    A GRUA SOBE E DESCE COM A BOLA — pedido: *"quanto mais longe a bola
    estiver, mais alto estará a grua"*.

    É o que um operador de jib faz, e por uma razão de enquadramento: com a
    bola na área, a câmara desce para a altura dos jogadores e apanha os
    corpos; com a bola longe, sobe para abrir o plano e não filmar só costas.

        `alturaMin` a bola em cima dele (a `distanciaMin` ou menos)
        `alturaMax` a bola no outro extremo (a `distanciaMax` ou mais)

    O MAXIMO SUBIU DE 4 PARA 6 M a pedido. A lanca tem 5.5 m e o pivo esta a
    2.3: para levar a camara aos 6 m ela tem de se erguer 42 graus, e nessa
    posicao o alcance HORIZONTAL cai de 5.4 para 3.9 m — ou seja o braco
    encolhe-se para dentro enquanto sobe, como qualquer jib. E por isso que a
    VISTA (tecla 8) e travada no eixo da baliza e nao segue o x da ponta; ver a
    nota do `olho` em GruasDeCamera.build.

    A DISTÂNCIA MEDE-SE AO CENTRO DA BALIZA desta grua, e não ao carrinho: é a
    baliza que ela filma, e é dela que a profundidade do plano depende.

    `distanciaMax` é 75 e não os 106 do campo inteiro: acima disso o lance já
    não é com ele (a bola está na área do outro lado, onde a outra grua está a
    filmar) e a altura ficaria colada ao máximo metade do jogo.

    `suavizacao` é a constante da subida, em segundos-ish — ver
    `fatorSuavizacao` (utils.js), a mesma suavização ao TEMPO que a câmara usa.
    Sem ela a lança dava saltos a cada passe: a bola muda de distância aos
    metros por frame, e uma jib não se mexe assim.
    */
    alturaMin: 2.0,
    alturaMax: 6.0,
    distanciaMin: 16.5,
    distanciaMax: 75.0,
    suavizacao: 0.06,

    cores: {
        estrutura: 0xe8c11a,   // o amarelo das gruas de televisão
        base: 0x3b3f46,
        contrapeso: 0x2a2d33,
        camara: 0x15171b
    }
};
if (typeof window !== 'undefined') window.GruaDeCamera = GruaDeCamera;
