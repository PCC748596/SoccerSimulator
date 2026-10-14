/*
=============================================================================
O MANDO DE CAMPO — a torcida e o 13.º jogador
=============================================================================
Pedido: *"o mandante tem que ter mais vantagem; a torcida e o 13.o jogador"*, e *"o mando de campo tambem afeta os
resultados"*. O motor nao tinha nada: quem joga em casa (a equipa A, a primeira do jogo) e o visitante eram iguais, e
numa temporada de 380 jogos o mandante ganhava 37% contra 38% do visitante (no futebol real: ~50% / 26% / 24%).

O MODELO e simples e mede-se: os jogadores da equipa da casa jogam melhor e os visitantes um pouco pior, em TODAS as
skills (o mesmo `skillFor` que o resto do jogo ja le), por `bonusCasa` e `malusFora` (fraccao: 0.06 = +6%). O arbitro
tambem pesa: uma fraccao `arbitroCasa` das faltas da equipa da casa nao e marcada (ver Officials.marcarFalta). A equipa
da casa e `equipa` ('TeamA').

Numeros de arranque, a afinar com o lote da liga (resultados casa/empate/fora contra 50 / 26 / 24).
=============================================================================
*/
const MandoModel = {
    activo: true,
    equipa: 'TeamA',
    bonusCasa: 0.06,
    malusFora: 0.03,
    // Fraccao das faltas da casa que o arbitro deixa passar (menos faltas e cartoes para a casa).
    arbitroCasa: 0.10
};
if (typeof window !== 'undefined') window.MandoModel = MandoModel;
