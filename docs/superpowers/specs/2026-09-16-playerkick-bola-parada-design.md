# PlayerKick — animação única para chutes de bola parada

Data: 2026-09-16

## Problema

O chute de bola parada não tem animação própria. Cada lance pede emprestado o gesto de outro sítio, e dois deles chegam a sobrepor-se no mesmo frame:

| lance | anima hoje | onde |
|---|---|---|
| `GOAL_KICK` | `GoalkeeperGroundKickClip` + mistura da pose de corrida | `js/player.js:6898` |
| `FREE_KICK` | `ShotClip` — o clip do remate de jogo corrido | `js/player.js:1085` |
| `PENALTY` | `ShotClip` | `js/player.js:1488` |
| `CORNER_KICK` | nenhum: a velocidade da bola é escrita no mesmo frame | `js/fsm.js:1160` |

O comentário em `js/player.js:1074` assume a dívida:

> A CORRIDA usa sempre o clip e o estado do REMATE, mesmo quando a falta vai acabar em passe curto.

E no tiro de meta há uma segunda animação por cima: o `gkKickBlend` faz cada canal do esqueleto sair da pose com que a corrida de aproximação acabou e ir até ao valor do clip. São duas animações a discutir o mesmo esqueleto.

## Objectivo

Uma animação contínua e autónoma — `PlayerKickClip` — que serve todos os chutes de bola parada. Não partilha keyframes, função de pose nem amostrador com o `ShotClip` nem com o `GoalkeeperGroundKickClip`. A aproximação vive dentro do clip, portanto nenhum ciclo de corrida se sobrepõe a ele.

O `ShotClip` continua a servir o remate de jogo corrido, que não é bola parada. O `GoalkeeperGroundKickClip` fica no ficheiro, intacto e sem quem o chame, para comparação no editor de animação.

## Âmbito deste passo

Dentro:

- `PlayerKickClip` com 8 keyframes, quatro deles âncoras lidas das imagens de referência GoalKick1 a GoalKick4
- função de pose e amostrador próprios
- estado de FSM próprio, `SET_PIECE_KICK`
- ligação a `GOAL_KICK`, `FREE_KICK` e `PENALTY`
- entrada no editor de animação, a par da entrada antiga

Fora:

- `CORNER_KICK`. Hoje escreve `Match.ballVel` no mesmo frame em que decide, sem `ActionState` nenhum; ligar o gesto obriga a adiar a escrita até ao `contactTime` e isso mexe em lógica com testes próprios (`canto_marcacao`, `canto_forca`, `cantos_campo`). Fica para um passo isolado.
- Penálti colocado. Neste passo o penálti inteiro usa o `PlayerKickClip`, que é um gesto de pancada. O gesto do penálti colocado é trabalho seguinte, e até lá o penálti colocado sai com o gesto errado — é visível e é aceite.

## As quatro âncoras

As imagens de referência mostram um chute com corrida de aproximação, lido em quatro instantes:

| imagem | o que mostra |
|---|---|
| GoalKick1 | tronco inclinado à frente e sobre o apoio, braços a abrir, perna de chute a recuar, bola ainda à frente no chão |
| GoalKick2 | última passada vista de trás: perna de chute atrás, joelho a fechar, braços abertos |
| GoalKick3 | armação máxima: coxa atrás, joelho muito flectido com o calcanhar alto, tronco à frente |
| GoalKick4 | extensão total: pernas em grande abertura, braços na horizontal, corpo projetado, pé ao nível da bola |

O gesto mais visível na referência é a abertura dos braços, que cresce de forma monótona ao longo das quatro: cerca de 45° na primeira até à horizontal na quarta. É o contrapeso da perna que vai atrás, e é o que dá a leitura de "chute com corrida" em vez de "estocada".

## Estrutura do clip

Oito keyframes: quatro âncoras e quatro interpolações.

| índice | t | papel | fonte |
|---|---|---|---|
| 0 | 0.000 | âncora — aproximação, apoio a plantar | GoalKick1 |
| 1 | 0.143 | interpolação — recuo a acelerar | — |
| 2 | 0.286 | âncora — última passada, joelho a fechar | GoalKick2 |
| 3 | 0.429 | interpolação — coxa e calcanhar a subir | — |
| 4 | 0.571 | âncora — armação máxima | GoalKick3 |
| 5 | 0.714 | interpolação — o chicote, perna passa a vertical | — |
| 6 | 0.857 | âncora — IMPACTO | GoalKick4 |
| 7 | 1.000 | interpolação — follow-through e descida | — |

`contactFrame: 7` (índice 6). Com `duration: 0.70` a bola sai aos 0.60 s.

As interpolações não são médias aritméticas dos vizinhos — a interpolação linear do amostrador já daria isso e os frames não acrescentariam nada. São enviesadas: o índice 1 e o 3 puxam para a armação (o recuo acelera, não é uniforme), e o índice 5 é o chicote, com a perna já muito à frente do ponto médio e o joelho a abrir.

## Convenção de sinais

São factos do rig (ver `buildBody` em `js/player.js`), não herança dos clips antigos:

```
coxaChute   > 0   perna para TRÁS      < 0   para a FRENTE
joelhoChute > 0   joelho dobra, calcanhar sobe
chest       > 0   tronco para a FRENTE
leanZ       < 0   corpo inclina sobre o pé de apoio
pitchX            rotação da bacia em torno de X
bracoLx/Rx  < 0   braço para a FRENTE e para cima
bracoLz     > 0   abre o braço esquerdo para fora
bracoRz     < 0   abre o braço direito para fora
cotoveloL/R < 0   antebraço dobra para a frente do braço
peRx/peLx   < 0   flexão plantar (ponta do pé a descer)
altura            deslocação vertical do corpo, em metros
```

`pernaChute: 'r'`. O pé de apoio é o esquerdo, em x = -0.4 no espaço local da bacia, e o `leanZ` roda o corpo em bloco à volta dele.

## Os 8 keyframes

```js
const PlayerKickClip = {
    pernaChute: 'r',
    contactFrame: 7,
    frames: [
        // 0 — GoalKick1: aproximação, pé de apoio a plantar, perna de chute a recuar
        { leanZ: -0.20, pitchX: -0.14, chest: 0.12, coxaChute: 0.50, joelhoChute: 0.95, coxaChuteZ: -0.05, coxaApoio: -0.10, joelhoApoio: 0.28, bracoLx: -0.40, bracoLz: 0.95, bracoRx: 0.30, bracoRz: -0.80, cotoveloL: -0.35, cotoveloR: -0.45, peRx: -0.08, peLx: 0.06, cabecaX: -0.25, altura: -0.01 },
        // 1 — o recuo acelera; enviesado para a armação, não é o ponto médio
        { leanZ: -0.25, pitchX: -0.18, chest: 0.15, coxaChute: 0.68, joelhoChute: 1.30, coxaChuteZ: -0.08, coxaApoio: -0.05, joelhoApoio: 0.30, bracoLx: -0.49, bracoLz: 1.01, bracoRx: 0.39, bracoRz: -0.89, cotoveloL: -0.32, cotoveloR: -0.51, peRx: -0.15, peLx: 0.04, cabecaX: -0.28, altura: -0.02 },
        // 2 — GoalKick2: última passada, perna atrás, joelho a fechar
        { leanZ: -0.28, pitchX: -0.21, chest: 0.17, coxaChute: 0.82, joelhoChute: 1.58, coxaChuteZ: -0.11, coxaApoio: -0.01, joelhoApoio: 0.32, bracoLx: -0.56, bracoLz: 1.06, bracoRx: 0.46, bracoRz: -0.96, cotoveloL: -0.30, cotoveloR: -0.56, peRx: -0.22, peLx: 0.02, cabecaX: -0.30, altura: -0.02 },
        // 3 — coxa e calcanhar a subir para a armação
        { leanZ: -0.32, pitchX: -0.24, chest: 0.20, coxaChute: 0.93, joelhoChute: 1.88, coxaChuteZ: -0.14, coxaApoio: 0.02, joelhoApoio: 0.34, bracoLx: -0.60, bracoLz: 1.15, bracoRx: 0.51, bracoRz: -1.04, cotoveloL: -0.27, cotoveloR: -0.64, peRx: -0.30, peLx: 0.01, cabecaX: -0.33, altura: -0.03 },
        // 4 — GoalKick3: armação máxima, calcanhar alto, tronco à frente
        { leanZ: -0.34, pitchX: -0.26, chest: 0.22, coxaChute: 1.00, joelhoChute: 2.10, coxaChuteZ: -0.16, coxaApoio: 0.04, joelhoApoio: 0.36, bracoLx: -0.62, bracoLz: 1.22, bracoRx: 0.55, bracoRz: -1.10, cotoveloL: -0.25, cotoveloR: -0.70, peRx: -0.35, peLx: 0.00, cabecaX: -0.35, altura: -0.03 },
        // 5 — o chicote: perna já muito à frente do ponto médio, joelho a abrir
        { leanZ: -0.24, pitchX: -0.10, chest: 0.16, coxaChute: 0.10, joelhoChute: 1.05, coxaChuteZ: -0.07, coxaApoio: 0.16, joelhoApoio: 0.24, bracoLx: -0.30, bracoLz: 1.36, bracoRx: 0.14, bracoRz: -1.30, cotoveloL: -0.18, cotoveloR: -0.44, peRx: -0.34, peLx: -0.06, cabecaX: -0.26, altura: 0.02 },
        // 6 — GoalKick4: IMPACTO. Abertura total, braços horizontais, corpo projetado
        { leanZ: -0.12, pitchX: 0.10, chest: 0.05, coxaChute: -0.95, joelhoChute: 0.08, coxaChuteZ: 0.02, coxaApoio: 0.30, joelhoApoio: 0.10, bracoLx: 0.05, bracoLz: 1.50, bracoRx: -0.30, bracoRz: -1.50, cotoveloL: -0.10, cotoveloR: -0.15, peRx: -0.30, peLx: -0.15, cabecaX: -0.15, altura: 0.10 },
        // 7 — follow-through: perna continua e desce, corpo assenta
        { leanZ: -0.05, pitchX: 0.06, chest: 0.02, coxaChute: -0.55, joelhoChute: 0.30, coxaChuteZ: 0.00, coxaApoio: 0.12, joelhoApoio: 0.16, bracoLx: 0.02, bracoLz: 0.85, bracoRx: -0.10, bracoRz: -0.85, cotoveloL: -0.08, cotoveloR: -0.10, peRx: -0.12, peLx: -0.04, cabecaX: -0.08, altura: 0.03 }
    ]
};
```

Abertura das pernas no impacto: `coxaChute -0.95` (54° à frente) contra `coxaApoio 0.30` (17° atrás), cerca de 71° de abertura, com `altura 0.10` para o corpo projetado que a imagem mostra.

### Desvio conhecido aos limites anatómicos

`joelhoChute 2.10` são 120°, dentro do `JointLimits.knee.x` máximo de 145°. Mas `coxaChute 1.00` na armação são 57° de extensão da anca, e o `JointLimits.hip.x` mínimo são -30°. O `JointLimits` não está ligado ao código de animação (diz-se no cabeçalho do próprio ficheiro), e os clips existentes têm o mesmo exagero — o `GoalkeeperGroundKickClip` vai a 0.96. Fica registado como desvio deliberado, para não ser lido como erro quando o `JointLimits` for ligado.

## Arquitectura

```
js/config/animations.js
    const PlayerKickClip = {...}                  novo
    ActionAnimClips.playerKick = { duration: 0.70, contactTime: 6 / 7 }

js/pose.js
    aplicarPosePlayerKick(rig, K, corpo)          nova, própria
    amostrarClipPlayerKick(norm)                  novo, próprio

js/fsm.js
    case 'SET_PIECE_KICK'                         novo estado
    temGestoComClip(estado)                       predicado extraído

js/animEditor.js
    PlayerKickClip: { rotulo: 'Chute de bola parada (GoalKick 1-4)' }
```

`aplicarPosePlayerKick` escreve o esqueleto directamente do keyframe, sem `poseAnterior` nem `peso`: não há mistura de entrada porque a aproximação já é parte do clip. É também o que torna a função utilizável pelo editor sem argumentos falsos.

O pivô no pé de apoio mantém-se — a bacia desloca-se em vez de só rodar, o que é o que se lê nas imagens 1 e 3, com o corpo inclinado em bloco sobre a perna plantada.

## O estado de FSM e os oito guardas

O gesto precisa de estado próprio. Sem ele o ciclo de corrida escreve as pernas por cima do clip no mesmo frame — o defeito exacto que este trabalho corrige.

Hoje há oito sítios que testam `'SHOOT'` só para dizer "este está a meio de um gesto com clip":

`js/player.js:490`, `:3662`, `:3731`, `:3945`, `:4458`, `:4681`, `js/fsm.js:829`, `js/fsm.js:853`

As listas não são idênticas — o `4458` exclui `TACKLE`, o `829` inclui `SLIDE_TACKLE` — portanto não se substituem por uma constante única. Extrai-se o predicado e cada sítio passa a chamá-lo mantendo as suas próprias excepções, em vez de se acrescentar `|| s === 'SET_PIECE_KICK'` oito vezes e se falhar num.

Falhar um guarda é o risco principal deste trabalho, e é verificável: depois da alteração, nenhum dos oito pode continuar a testar `'SHOOT'` por igualdade directa para este efeito.

## Ligação aos lances

`baterFalta` (`js/player.js:1085`) e o penálti (`js/player.js:1488`) trocam o clip `'shot'` por `'playerKick'` e o estado `'SHOOT'` por `'SET_PIECE_KICK'`. Os dois já leem `ActionAnimClips[clip].contactTime` dinamicamente, portanto a corrida do `onPrepare` reajusta-se sozinha ao `contactTime` novo.

O tiro de meta do guarda-redes (`js/player.js:6896`) passa a amostrar o clip novo. O `gkKickBlend` deixa de escrever esqueleto e passa a transladar apenas o corpo até `plantX`/`plantZ`, que é a única coisa que ainda tem de fazer.

## Custo medido e não medido

A bola sai 0.35 s mais tarde na falta e no penálti (`shot` tem `duration 0.50` e `contactTime 7/11`, ou seja contacto aos 0.318 s; o novo contacta aos 0.60 s) e 0.45 s mais tarde no tiro de meta (era `duration 0.25`). `SetPiecePrazos.tiroDeMeta` são 20 s e o `FREE_KICK` tem 15 s, portanto nenhum prazo fica apertado. Em bola parada ninguém pressiona o batedor, logo não há custo táctico — ao contrário do que aconteceu quando o passe ganhou gesto.

O que não está medido é a leitura do follow-through. Com 8 frames sobra um único frame depois do impacto, 0.10 s para levar a perna da abertura total até ao chão, e é provável que se leia seco. É aceite para arrancar; a decisão de crescer para 10 ou 12 frames toma-se depois de ver o gesto no editor.

## Verificação

- `tests/pose_partilhada.test.js:48` e `:248` e `tests/anim_editor_export.test.js:57` têm listas de clips; o clip novo entra nelas e passa a ser exercitado pelos testes que já existem
- os oito guardas, confirmados um a um depois da alteração
- o gesto visto no editor de animação, com a entrada antiga ao lado para comparação
