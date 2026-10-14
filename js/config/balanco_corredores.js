/*
=============================================================================
O BALANCO DO JOGO POR CORREDOR (Left / Center / Right) — tempo de posse por corredor
=============================================================================
Pedido: o treinador escolhe os corredores (os botoes Left / Center / Right do painel, `Tatics.setores`) e o time
tem de JOGAR por eles essa percentagem do TEMPO. O que havia era um bonus fixo para o corredor ligado e a
congestao do momento; nada media o tempo que o time passava com a bola em cada lado, por isso nada o corrigia.

O ALVO, pelos corredores ligados (so 0, 1 ou 2 — ligar os 3 e o mesmo que nenhum):

    nenhum ligado      33.3 / 33.3 / 33.3
    1 ligado           60 no ligado, 15 e 15 nos outros
    2 ligados          45 e 45 nos ligados, 10 no que sobra

A MEDIDA e o tempo COM A BOLA da equipa em cada corredor, numa janela deslizante (`janela` s de posse). O corredor e
o da bola no referencial de ATAQUE da equipa (esquerda/direita de quem ataca), em tercos IGUAIS do campo
(CAMPO_LARG / 6), com uma HISTERESE de `histerese` m: a bola so conta como estando noutro corredor depois de passar
o corte por esta distancia — sem ela, uma bola em cima da linha trocava de corredor a cada frame.

A MARGEM e em TEMPO (pontos de percentagem), nao em metros: com 2 ligados (45%) o time pode ir a 55% de um lado;
dai para a frente passa a ser empurrado para o outro. O empurrao cresce com o excesso, de 0 na margem a 1 a
`margem + escala`, e entra na nota do passe como `pontosPasse` pontos: sobe para o corredor onde falta tempo e
desce para o que ja passou do alvo (ver `TempoPorCorredor.ajusteDePasse`, js/balanco_corredores.js).
=============================================================================
*/
const BalancoCorredores = {
    activo: true,
    // Janela da media deslizante, em segundos de POSSE da equipa.
    janela: 100.0,
    // Os cortes entre corredores, em x no referencial de ataque: +- corteX. Tercos iguais do campo.
    corteX: null,            // null = CAMPO_LARG / 6
    histerese: 3.0,          // m
    // Margem em tempo (pontos de percentagem, 0.10 = 10%) e quanto mais para chegar ao empurrao inteiro.
    margem: 0.10,
    escala: 0.10,
    // O maximo que o empurrao soma ou tira a nota de um passe (do mesmo tamanho do bonus de inversao).
    pontosPasse: 420,
    // Os alvos, pelo numero de corredores ligados.
    alvoSemLigados: 1 / 3,
    alvoUmLigado: { ligado: 0.60, outros: 0.15 },
    alvoDoisLigados: { ligados: 0.45, resto: 0.10 },

    /*
    A INVERSAO SINALIZADA E O APOIO SUP_TO_INVERT (js/inversao_sinalizada.js). Nasce quando o corredor da bola passou do
    alvo + margem de tempo; o destino e o corredor com mais falta. Se nao ha ninguem livre la (inversao directa), um
    colega recua para um espaco livre atras da bola (`recuo` m) e para o lado do destino (`lateral` m), para receber e
    jogar para o lado contrario.
    */
    inversao: {
        activo: true,
        duracaoMax: 9.0,          // s: o sinal morre se a bola nao chegar ao destino
        fimNoDestino: 1.2,        // s com a bola ja no corredor de destino
        cooldown: 4.0,            // s sem novo sinal depois de acabar um
        diferencaMin: 0.05,       // o destino tem de estar pelo menos 5 pontos abaixo do corredor da bola
        larguraMin: 16,           // m de lado, no minimo, para um passe contar como inversao
        livreMin: 4.0,            // m ao adversario mais perto, para um colega/ponto contar como livre
        recuo: [5, 8, 11],        // m atras da bola, para o apoio
        lateral: [4, 8, 12],      // m para o lado do destino
        raioApoio: 28,            // m: so quem esta a menos disto do ponto
        reavaliacao: 0.6,         // s entre escolhas do ponto/jogador
        janelaPassePosReceb: 4.0  // s em que o passe de quem recebeu como apoio para o destino conta como inversao
    }
};
if (typeof window !== 'undefined') window.BalancoCorredores = BalancoCorredores;
