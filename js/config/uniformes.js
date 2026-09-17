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
escreve aqui é exactamente o que se conta no ecrã. O Flamengo da fotografia tem
cinco pares de faixas no tronco; o Fluminense leva listras finas, e por isso
doze.

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
        camisa: { padrao: 'faixas', cores: ['#c8102e', '#17171b'], divisoes: 10 },
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
        camisa: { padrao: 'listras', cores: ['#7a1b2b', '#0f6b3a', '#f2f2f2'], divisoes: 12 },
        calcao: '#f2f2f2',
        meiao: { padrao: 'solido', cores: ['#f2f2f2'] },
        numero: '#0b4728',
        contorno: 'rgba(255,255,255,0.85)'
    }
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
a etiqueta, o minimapa. É a primeira cor da camisa — a dominante do desenho,
que é como um clube se identifica ("o rubro-negro", "o tricolor" lê-se pelo
vermelho e pelo grená).
*/
function corDoUniforme(uniforme, porOmissao) {
    if (!uniforme || !uniforme.camisa) return porOmissao;
    const cores = uniforme.camisa.cores;
    return (cores && cores.length) ? cores[0] : porOmissao;
}

if (typeof window !== 'undefined') {
    window.Uniformes = Uniformes;
    window.uniformeDe = uniformeDe;
    window.corDoUniforme = corDoUniforme;
}
