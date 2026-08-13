# Como um jogador decide o que fazer

Este documento explica, passo a passo, a "alma do jogo": a lógica que cada
jogador corre TODO FRAME para decidir se corre, toca, chuta, cruza, lança,
marca, cobre ou apoia. Não é uma proposta — é a descrição do que o código
faz hoje, para leitura com calma.

## 1. As 3 camadas de decisão

```
TeamBT (nível 1)      "Como a equipa se organiza agora?"
   |                  bloco, linha defensiva, quem persegue a bola,
   |                  quem marca quem, postura (pressão alta, báscula...)
   v
PositionBT (nível 2)  "Onde ESTE jogador deve estar, dado o papel dele?"
   |                  slot no bloco + desvios (suporte, marcação, cobertura,
   |                  ataque de área...) -> escreve em p.dynamicTarget
   v
PlayerBT (nível 3)    "O que ESTE jogador faz AGORA?"
                       passar / rematar / cruzar / lançar / conduzir /
                       marcar / bloquear / apoiar / carrinho / desarme
```

O nível 1 corre por equipa (uma vez, não por jogador). Os níveis 2 e 3 correm
por jogador, todo frame. O nível 3 (`js/bt/player_bt.js`) é o assunto deste
documento — é ele que produz o *evento* (passe, chute, condução...); os
níveis 1-2 só preparam o terreno (posição alvo, quem está livre, quem
persegue).

Arquivo principal: `js/bt/player_bt.js`. A árvore chama-se `PlayerBT`.

## 2. A árvore, por ordem de prioridade

O `PlayerBT` é um **selector**: testa os ramos de cima pra baixo e executa o
PRIMEIRO que a condição deixar passar. A ordem importa — é a única coisa que
faz um remate ganhar de um passe, por exemplo.

```
PlayerRoot (selector)
├── BolaParada        jogo parado (kickoff, canto) -> IDLE / SET_PIECE_*
├── AccaoEmCurso       já está em PASS/SHOOT/TACKLE/SLIDE_TACKLE -> deixa acabar
├── ComBola             SE eu tenho a bola:
│   ├── Dominar             ainda dentro da janela de cadência -> conduz, não decide
│   ├── GuardaRedesJoga     SE sou GR -> passe curto / lançamento / segurar
│   ├── Rematar             SE em zona e ângulo de remate -> CHUTA
│   ├── Cruzar              SE na ala + alvo na área + sorteio -> CRUZA
│   ├── ConduzirEmEspaco    SE espaço aberto à frente -> CONDUZ
│   ├── Lancar              SE espaço nas costas da defesa (sorteio) -> LANÇA
│   ├── Passar              SE achou alvo por pontuação (sorteio) -> PASSA
│   └── (fallback) conduzir                                  -> CONDUZ
└── SemBola             SE eu NÃO tenho a bola:
    ├── Carrinho            perto do portador adversário, ângulo ok -> CARRINHO
    ├── Desarme              muito perto do portador -> DESARME DE PÉ
    ├── IrABola              sou o perseguidor designado -> PERSEGUE
    ├── Receber              a bola vem pra mim -> vai ao encontro
    ├── GuardaRedes          sou GR -> posiciona na baliza
    ├── AtacarArea           colega vai cruzar -> ataca a área (1º/2º poste)
    └── (fallback) ocuparPosicao -> MARKING / BLOCKING / FWR_SUPPORT / AFT_SUPPORT
```

Cada folha é uma condição (`cond`) + uma acção (`act`). Se a condição falha,
o selector tenta a próxima. **Nada aqui é aleatório na ORDEM** — o
aleatório entra dentro de cada condição (chance de cruzar, chance de passar
vs conduzir, etc.), nunca na ordem em que são tentadas.

## 3. Com bola — cada ramo em detalhe

### 3.1 Dominar (cadência)

Antes de poder passar/rematar/lançar, o jogador "pensa" por um tempo
(`CadenceModel.posseBase = 3.0s`, ou `posseSobPressao = 0.6s` se marcado de
perto). Skill acelera isto até 25%. Durante essa janela ele só CONDUZ
(`actCarry`) — não fica parado, mas também não decide nada.

Excepção: se já está de frente pro gol dentro do alcance de remate
(`emZonaDeRemate`), pula a cadência e vai directo pro remate — senão entrava
na área com o guarda-redes batido e ainda "pensava" 3 segundos.

### 3.2 Rematar

`emZonaDeRemate(ctx)`: `zoneAhead > 15` (já passou o meio-campo) E distância
até à baliza dentro de `shootingRange()` E ângulo dentro de
`ShootingModel.maxOffsetX`. Sem sorteio — se está na zona, remata.

### 3.3 Cruzar

`findCross(ctx)`: só se `|x| > CrossModel.alaX` (está na ala) e
`zoneAhead > CrossModel.zonaZ` (avançado o suficiente). Precisa de pelo
menos um colega já dentro da área (`AtacarArea`, ver §4, é quem garante isso
— sem ele nunca havia ninguém lá dentro). A `chance` de cruzar de facto sobe
com nº de alvos na área, largura, profundidade, e desce sob pressão.

### 3.4 Conduzir em espaço aberto

Vem ANTES do passe de propósito — senão um avançado isolado com 20m de
relva livre à frente sempre acabava a tocar pra trás só porque havia sempre
alguém por perto. `campoAberto` = sem pressão E espaço à frente acima de
`CarryModel.espacoLivre` E ainda não estourou `CarryModel.distanciaMax` de
condução acumulada (evita condução infinita).

### 3.5 Lançar (through ball)

`findThroughBall`: só meio-campo/ataque, chance-base `throughBallChance`,
mira o ESPAÇO atrás da última linha adversária (não a posição actual de
ninguém) onde um colega consiga chegar primeiro, com esse espaço livre de
adversário — hoje já verificado via `SpatialGrid.findFreeSpace`.

### 3.6 Passar — a pontuação, jogador por jogador

Este é o ramo que estava a preocupar (o CF livre a ser ignorado). A função é
`findPassTarget()` em `js/player.js`. Para cada colega candidato:

```
score = 100
      + até 110  livre de marcação   (quanto mais longe o adversário mais
                                       perto do LIVRE, maior — ver nota abaixo)
      + 30       se cai num sector do painel (Left/Center/Right) activado
      + 20-55    progressão para a frente (se o passe avança o jogo)
      - |progressão|   se o passe recua
      + bónus de distância conforme o Estilo de Passe (Curto/Misto/Longo)
```

Ganha quem tiver a pontuação mais alta. **Corrigido nesta sessão**: o bónus
por estar livre tinha um tecto baixo (+50) que tratava "um pouco livre" e
"completamente sozinho no campo" quase da mesma forma — agora vai até +110,
com inclinação maior, para um jogador realmente livre destacar-se bem acima
de qualquer opção próxima e marcada. Também os tectos de distância (que
cortavam candidatos DEMASIADO longe, ex.: 46m no Misto) foram alargados —
antes um atacante lançado lá à frente podia nem entrar na lista de
candidatos, por mais livre que estivesse.

Mesmo achando um bom alvo, `Passar` só dispara com probabilidade
`1 - PassModel.carryChance` (ajustada pelo Estilo de Passe e reduzida sob
pressão) — o resto das vezes conduz mais um pouco em vez de tocar
imediatamente. Isto é para dar variedade (nem toda posse vira um passe
instantâneo assim que há opção), mas significa que MESMO com um alvo
perfeito identificado, pode não passar naquele frame exacto — só no próximo,
ou no seguinte.

### 3.7 Conduzir (fallback)

Se nada acima disparou, conduz de qualquer forma — nunca fica parado com a
bola.

## 4. Sem bola — cada ramo em detalhe

- **Carrinho**: só dentro de 2.5-4.5m do portador adversário, e só de
  frente (0-45°) ou de lado (45-90°) em relação à direcção de movimento
  dele — carrinho por trás não vale (corrigido nesta sessão).
- **Desarme de pé**: dentro de 2.5-2.8m, taxa por segundo (não por frame).
- **Ir à bola**: só o `chaser` designado pelo nível 1 (TeamBT) — evita todo
  mundo correr pra bola ao mesmo tempo.
- **Receber**: sou o `Match.intendedReceiver` de um passe em curso.
- **Guarda-redes**: posiciona-se na baliza (não passa por aqui quando tem a
  bola — isso é tratado à parte em `updateGK`, ver `js.md`).
- **Ataque à área**: colega em posição de cruzar → vai ocupar o 1º ou 2º
  poste (alterna por `id % 2`), pra o cruzamento ter alvo.
- **Fallback — `ocuparPosicao`**: aqui é onde nasce o rótulo do estado
  (`MARKING`/`BLOCKING`/`FWR_SUPPORT`/`AFT_SUPPORT`/`MOVE_TO_POS`):
  - equipa tem a bola e o jogador está à frente dela → `FWR_SUPPORT`
  - equipa tem a bola e o jogador está atrás dela → `AFT_SUPPORT`
  - sem bola, tem alvo de marcação (`p.markingTarget`, definido no nível 1
    `assignMarking`) → `MARKING`, à distância do Defensive Pressure
    (Low 4m / Balanced 3m / High 2m)
  - sem bola, sem par pra marcar (`p.isCovering`) → `BLOCKING` (fecha a
    linha entre a bola e a própria baliza)
  - resto → `MOVE_TO_POS` genérico

O ALVO (`p.dynamicTarget`) usado por estes 4 últimos já vem calculado pelo
nível 2 (`defendZonal`/`marcar` em `js/bt/position_bt.js`) — o nível 3 só
rotula o que está a acontecer para aparecer certo no debug.

## 5. Onde mexer, por sintoma

| Sintoma | Onde |
|---|---|
| Jogador livre não recebe passe | `findPassTarget()` em `js/player.js` — pontuação |
| Passa cedo/tarde demais | `CadenceModel` em `js/config.js` |
| Marca muito solto/colado | `MarkingModel.distanciaPorPressao`/`biasMaxPorPressao` em `js/config.js` |
| Cruza pouco/demais | `CrossModel` em `js/config.js`, condição em `findCross` |
| Lança pouco (through ball) | `PassModel.throughBallChance`/`throughBallGap` |
| Conduz demais em vez de passar | `PassModel.carryChance*` |
| Remata tarde/cedo | `ShootingModel`, `emZonaDeRemate` |
| Ignora o setor de campo (Left/Center/Right) | `Tatics.getWeightedSectorX` em `js/config.js` |
| Carrinho/desarme errado | folhas `Carrinho`/`Desarme` em `player_bt.js` |
