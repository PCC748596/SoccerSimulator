/*
=============================================================================
CONFIG: UNIFORMES DOS CLUBES
=============================================================================
Até aqui o equipamento era do LADO e não do clube: o `createTeams` pintava o
TeamA de azul e o TeamB de vermelho, escolhesse-se o Flamengo ou o ABC. Os
planteis são reais (data/squads.js, de assets/teams.json) e os equipamentos
não eram.

Pedido, com fotografias das camisolas:

    Flamengo-RJ     camisa preta e vermelha, calção preto, meião preto e
                    vermelho, número BRANCO
    Fluminense-RJ   camisa tricolor, calção branco, meião branco, número
                    VERDE ESCURO

UM UNIFORME AQUI É UM DESENHO, e não uma cor: as duas camisolas pedidas têm
padrão, e um `#hex` não as sabe dizer. Por isso cada peça leva `padrao` e uma
lista de `cores`:

    'solido'    uma cor, a primeira da lista
    'faixas'    barras HORIZONTAIS, alternando as cores (o Flamengo)
    'listras'   barras VERTICAIS, ciclando as cores (o Fluminense)

`divisoes` é quantas barras aparecem na peça. É um número de DESENHO e não de
medida: as faces do tronco são mapeadas 0..1 cada uma, portanto o que se
escreve aqui é exactamente o que se conta no ecrã.

`barra` (opcional) pinta uma BARRA na bainha da peça, por cima de tudo o resto
— a vermelha do Flamengo e a verde no calção do Fluminense. A `altura` dela é
uma FRACÇÃO da peça e não píxeis: a mesma peça é pintada em canvas de 256 e de
512 conforme onde é usada, e uma barra em píxeis saía com espessuras diferentes
na mesma camisola.

`centrada` (opcional) alinha a barra mais LARGA com o meio da peça, deslocando
o padrão todo em círculo — é como uma camisola às riscas se desenha, com a
listra central no eixo do peito e as outras a crescer para os dois lados. Sem
ela, onde o meio cai depende de quantas barras cabem e dos pesos delas.

`pesos` (opcional) dá LARGURAS DIFERENTES a cada cor do ciclo. Pedido: *"na
camisa tricolor as faixas grená e verde escuro são mais largas que as
brancas"*. Sem ele as barras são todas iguais, que é o que basta para as faixas
do Flamengo; com ele, a largura de cada barra é proporcional ao peso da cor
dela — e é assim que o branco do Fluminense fica a fazer de risca entre duas
faixas largas, em vez de as três cores dividirem a camisola por igual.

O NÚMERO TEM COR PRÓPRIA, e é a razão pela qual isto não podia sair da cor da
camisa: sobre as faixas do Flamengo (metade preta, metade vermelha) só o branco
se lê, e sobre o tricolor do Fluminense pediu-se o verde escuro. O `contorno` é
o que garante a leitura na barra da cor errada — um número branco cai sempre em
cima de uma faixa vermelha em algum ponto das costas.

O GUARDA-REDES NÃO ENTRA AQUI, de propósito: ele veste de outra cor por regra
(tem de se distinguir dos dez e dos outros onze), e o `createTeams` continua a
dar-lhe o equipamento próprio de sempre. Um uniforme de guarda-redes por clube
é outro pedido.

QUEM NÃO ESTIVER NA TABELA fica como estava — azul do lado A, vermelho do lado
B. São 218 equipas nos dados; isto é uma tabela de desenhos feitos à mão, e
cresce à medida que forem pedidos.
=============================================================================
*/
const Uniformes = {
    /*
    FLAMENGO. As faixas rubro-negras: vermelho e preto em barras horizontais,
    o resto do equipamento preto, o meião a repetir a camisola.

    O vermelho é o da camisola da fotografia (um vermelho de bandeira, não
    laranja), e o preto não é puro: a preto puro o boneco perde as costuras e
    as sombras do modelo, e a camisola lê-se como um buraco.
    */
    'Flamengo-RJ': {
        /*
        CINCO FAIXAS: TRÊS PRETAS E DUAS VERMELHAS — pedido, e a contagem
        manda no desenho.

        Estavam dez barras (cinco pares), e a olho lia-se como um padrão de
        risquinhas e não como a camisola: as faixas do Flamengo são largas.
        Cinco barras num tronco dão faixas com o dobro da altura.

        A ORDEM DAS CORES É QUE DÁ OS TRÊS PRETOS. Com `divisoes: 5` e duas
        cores, as barras saem 0,1,0,1,0 — ou seja a PRIMEIRA cor aparece três
        vezes e a segunda duas. Por isso o preto vem primeiro na lista: trocar
        a ordem é trocar quem fica com três.

        O pedido dizia "duas brancas"; ficam VERMELHAS, que é a outra cor do
        uniforme 1 que ele próprio descreveu ("preta e vermelha") e a que está
        na fotografia da camisola. Para as ter brancas de verdade, é trocar
        `#c8102e` por `#f2f2f2` aqui — e mais nada.
        */
        /*
        E UMA BARRA VERMELHA NA BAINHA (pedido). Com cinco faixas e a primeira
        preta, a de baixo tambem sai preta — a barra devolve o vermelho ao
        fundo da camisola, que e o remate que a fotografia mostra.

        `altura` e uma fraccao da peca: 0.10 sao os ultimos 10% da textura.
        */
        camisa: {
            padrao: 'faixas', cores: ['#17171b', '#c8102e'], divisoes: 5,
            barra: { cor: '#c8102e', altura: 0.10 }
        },
        /*
        A COR QUE O REPRESENTA no disco da vista táctica e nas etiquetas é o
        VERMELHO, e por isso é escrita à parte.

        O disco saía da primeira cor da camisa, e essa passou a ser o preto
        quando as faixas mudaram de ordem (é a ordem que dá três pretas) — um
        disco preto com o contorno preto do TeamA é um disco que não se vê. É
        também o vermelho que identifica o clube de longe.
        */
        corPrincipal: '#c8102e',
        calcao: '#17171b',
        meiao: { padrao: 'faixas', cores: ['#17171b', '#c8102e'], divisoes: 6 },
        numero: '#ffffff',
        contorno: 'rgba(0,0,0,0.8)'
    },

    /*
    FLUMINENSE. O tricolor: grená, verde e branco em listras VERTICAIS finas —
    é a ordem e a finura que fazem a camisola ler-se como ela, e não o facto de
    lá estarem as três cores.

    Calção e meião brancos, e o número em verde escuro (pedido): sobre listras
    que incluem o branco, o verde escuro é a única das três cores da camisola
    que se lê em todas as outras.
    */
    'Fluminense-RJ': {
        /*
        AS LISTRAS NÃO SÃO TODAS DA MESMA LARGURA — pedido: *"as faixas grená e
        verde escuro são mais largas que as brancas"*. É o que está na
        fotografia: duas faixas de cor separadas por uma risca branca fina.

        Os pesos são relativos e seguem a ordem das cores. Estiveram em
        1.7/1.7/0.6 e voltou o mesmo pedido — *"as faixas grená e verde do
        Fluminense são mais largas"* —, portanto vão a **2.6/2.6/0.5**: as
        faixas de cor ficam cinco vezes mais largas que a risca branca, que
        passa a ser o filete que as separa em vez de uma terceira listra.

        Com doze barras, a camisola fica com quatro ciclos de
        grená/verde/branco.
        */
        camisa: {
            padrao: 'listras',
            cores: ['#7a1b2b', '#0f6b3a', '#f2f2f2'],
            pesos: [2.6, 2.6, 0.5],
            /*
            DOZE LISTRAS COM UMA LARGA NO MEIO — pedido. As doze já lá
            estavam; o que faltava era o alinhamento: com o padrão a começar
            na borda esquerda, o eixo do peito calhava numa risca branca fina.
            Ver `centrada` no cabeçalho.
            */
            divisoes: 12,
            centrada: true
        },
        /*
        O CALÇÃO É BRANCO COM UMA BARRA VERDE (pedido). É uma peça e não uma
        cor — ver o `pecaCalcao` no construirCorpo; a barra fica na bainha, com
        o mesmo verde das listras da camisola.
        */
        calcao: {
            padrao: 'solido',
            cores: ['#f2f2f2'],
            barra: { cor: '#0f6b3a', altura: 0.16 }
        },
        meiao: { padrao: 'solido', cores: ['#f2f2f2'] },
        // O grená é a dominante do tricolor — ver corPrincipal no Flamengo.
        corPrincipal: '#7a1b2b',
        numero: '#0b4728',
        contorno: 'rgba(255,255,255,0.85)'
    },

    /*
    GRÉMIO. Pedido: *"igual à tricolor do Fluminense mas em preto, branco e
    azul claro. Short preto, meião preto."*

    É o mesmo DESENHO — listras verticais com os mesmos pesos, duas faixas
    largas separadas por uma risca branca fina — com outras três cores. Por
    isso os números são os do Fluminense: mudar aqui a largura das listras
    seria deixar de ser "igual à tricolor", que é o que foi pedido.

    QUAIS SÃO AS LARGAS: o preto e o azul. A analogia com o Fluminense manda —
    lá o branco é o filete entre o grená e o verde, e aqui é o mesmo papel. É
    também o que faz a camisola ler-se como a do Grémio: azul e preto a
    alternar, com o branco a separá-los.

    O número fica BRANCO com contorno escuro (não foi pedido): sobre listras
    pretas e azuis é a única das três cores da camisola que se lê nas duas.
    */
    'Grêmio-RS': {
        camisa: {
            padrao: 'listras',
            cores: ['#15151a', '#4aa3e0', '#f2f2f2'],
            pesos: [2.6, 2.6, 0.5],
            // Doze listras com a larga no meio, como a do Fluminense — é o
            // mesmo desenho, e o teste obriga os dois a andar a par.
            divisoes: 12,
            centrada: true
        },
        // O azul é a cor por que o clube se reconhece de longe — ver
        // corPrincipal no Flamengo, e a razão de não ser a primeira da lista.
        corPrincipal: '#4aa3e0',
        calcao: '#15151a',
        meiao: { padrao: 'solido', cores: ['#15151a'] },
        numero: '#ffffff',
        contorno: 'rgba(0,0,0,0.8)'
    }
};

/*
=============================================================================
O UNIFORME DO GUARDA-REDES
=============================================================================
Ele não veste o do clube, e não é uma omissão: veste de outra cor por regra,
para se distinguir dos dez e dos outros onze. As cores continuam a vir do
`createTeams` (amarelo de um lado, laranja do outro); o que este uniforme
acrescenta é o que a camisola dele tem de diferente.

    MANGA COMPRIDA — pedido: *"ajusta a camisa do goleiro para manga
    comprida"*. É a camisola dele em qualquer estádio, e uma das coisas que o
    faz ler como guarda-redes de longe.

Não leva `camisa` nem `calcao`: sem eles, o `construirCorpo` usa as cores que o
`createTeams` lhe passa, e o número continua a sair do LADO como sempre. É de
propósito que isto é um objecto quase vazio — o dia em que houver equipamento
de guarda-redes por clube, é aqui que ele entra, e o resto do caminho já está
feito.
=============================================================================
*/
const UniformeGuardaRedes = {
    mangaComprida: true
};

/*
O uniforme de uma equipa, pelo NOME com que ela vem nos dados
(`SquadsData.equipas[].nome`, que é o `teamName` do assets/teams.json).

Devolve `null` para quem não tiver desenho feito — e é o `null` que mantém o
comportamento antigo em 216 das 218 equipas, em vez de lhes inventar um
equipamento a partir da cor do ficheiro de dados (que é uma palavra como "RED"
ou um `#hex` só, e não dá um desenho).
*/
function uniformeDe(nome) {
    if (!nome || typeof Uniformes === 'undefined') return null;
    return Uniformes[nome] || null;
}

/*
A COR QUE REPRESENTA O UNIFORME quando só cabe uma: o disco da vista táctica,
a etiqueta, o minimapa.

SAI DO `corPrincipal` e não da primeira cor da camisa. A ordem das cores serve
o DESENHO (no Flamengo é ela que dá três faixas pretas e duas vermelhas), e
essa ordem não tem nada a ver com a cor por que o clube se reconhece de longe —
com a primeira cor, o disco do Flamengo ficava preto com contorno preto. Sem
`corPrincipal` escrito, cai na primeira cor, que é o que serve a maioria.
*/
function corDoUniforme(uniforme, porOmissao) {
    if (!uniforme) return porOmissao;
    if (uniforme.corPrincipal) return uniforme.corPrincipal;
    const cores = uniforme.camisa ? uniforme.camisa.cores : null;
    return (cores && cores.length) ? cores[0] : porOmissao;
}

if (typeof window !== 'undefined') {
    window.Uniformes = Uniformes;
    window.UniformeGuardaRedes = UniformeGuardaRedes;
    window.uniformeDe = uniformeDe;
    window.corDoUniforme = corDoUniforme;
}
