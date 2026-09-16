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

- `PlayerKickClip` com 4 keyframes, um por imagem de referência (GoalKick1 a GoalKick4)
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

Quatro keyframes, um por imagem. Sem frames intermédios: a versão anterior
deste documento propunha oito, com quatro âncoras e quatro interpolações, e foi
recusada — "usa só 4 frames mesmo".

| índice | t | papel | fonte |
|---|---|---|---|
| 0 | 0.000 | aproximação, apoio a plantar | GoalKick1 |
| 1 | 0.333 | última passada, joelho a fechar | GoalKick2 |
| 2 | 0.667 | armação máxima, calcanhar alto | GoalKick3 |
| 3 | 1.000 | IMPACTO | GoalKick4 |

`contactFrame: 4` (índice 3), `contactTime: 1`. O contacto é o último
keyframe, portanto não há follow-through: a bola sai no instante em que o
gesto acaba. O `ActionState` aceita-o — o `norm < contactTime` do `update`
falha quando `norm` chega a 1, e o contacto dispara nesse frame, antes de o
`isDone()` limpar o estado.

### A duração é um tecto medido

Varrida contra os dois testes de medição que apanham o custo de atrasar a bola
parada — `saida_de_bola_ritmo` (tecto de 12% de leituras abaixo de 3 m/s
enquanto o guarda-redes segura) e `gk_agarra_com_a_mao` (mínimo de 5 agarradas
em 20 minutos de jogo):

| duração | abaixo de 3 m/s | agarradas |
|---|---|---|
| 0.25 s | 5% | 10 |
| 0.35 s | 8% | 9 |
| 0.45 s | 10% | 7 |
| **0.55 s** | **8%** | **10** |
| 0.70 s | 14% reprova | 4 reprova |

Não é monótono: 0.55 mede melhor que 0.45. A simulação é caótica e uma leitura
por semente vale pouco sozinha, que é a mesma fragilidade escrita no cabeçalho
desses dois testes. O que não é ruído é o 0.70 reprovar os dois ao mesmo tempo
e por larga margem. Ficou 0.55, o mais longo testado que passa com folga.

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

## Os 4 keyframes

Os valores estão em `js/config/animations.js`, em `PlayerKickClip`. O que os
governa:

- **A perna de chute é sempre a mesma.** `coxaChute` faz
  `0.45 -> 0.65 -> 0.95 -> -0.70`: recua de forma monótona nos três primeiros
  e vem à frente uma única vez, no impacto. Não há ramo nenhum que troque de
  perna a meio.
- **A abertura dos braços é o gesto mais visível da referência**, e cresce de
  forma monótona: `bracoLz` de 0.70 (40°) na imagem 1 até 1.55 (89°, a
  horizontal) na imagem 4.
- **A armação** é `joelhoChute 2.20`, 126° — o calcanhar junto ao glúteo que a
  imagem 3 mostra, dentro do tecto de 145° do `JointLimits.knee.x`.
- **O impacto** abre as pernas em `coxaChute -0.70` (40° à frente) contra
  `coxaApoio 0.75` (43° atrás), 83° no total, com o tronco a abrir para trás
  (`chest` negativo) e o corpo 0.18 m mais alto: na imagem 4 os dois pés estão
  no ar.

### Desvio conhecido aos limites anatómicos

`joelhoChute 2.20` são 126°, dentro do `JointLimits.knee.x` máximo de 145°. Mas `coxaChute 0.95` na armação são 54° de extensão da anca, e o `JointLimits.hip.x` mínimo são -30°. O `JointLimits` não está ligado ao código de animação (diz-se no cabeçalho do próprio ficheiro), e os clips existentes têm o mesmo exagero — o `GoalkeeperGroundKickClip` vai a 0.96. Fica registado como desvio deliberado, para não ser lido como erro quando o `JointLimits` for ligado.

## Arquitectura

```
js/config/animations.js
    const PlayerKickClip = {...}                  novo
    ActionAnimClips.playerKick = { duration: 0.55, contactTime: 1 }

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

## O estado de FSM e os guardas

O gesto precisa de estado próprio. Sem ele o ciclo de corrida escreve as pernas
por cima do clip no mesmo frame — o defeito exacto que este trabalho corrige.

### A causa real, encontrada na implementação

O desenho dizia "há oito sítios que testam `'SHOOT'` e falta acrescentar o
estado novo a todos". Ao implementar apareceu um nono, e é o que importa: **o
ramo do ciclo de corrida não tinha guarda de estado nenhuma.**

```js
// js/player.js, animateBones — antes
if (speed >= 0.1) {
    ...
    aplicarPosePassada(rig, P, t, {...});   // a perna INTEIRA, por atribuição
}
```

Escrevia a perna toda sempre que `speed >= 0.1`, fosse qual fosse o estado. O
remate e o passe escapavam **por acidente e não por desenho**: os dois fazem
`velocity.set(0, 0, 0)` antes de entrar no gesto, portanto `speed` já vinha a
zero e o ramo nunca corria. Quem entrasse num gesto com clip ainda em
andamento levava o ciclo de corrida por cima durante os ~20 frames que a
velocidade demora a decair — e o ciclo de corrida **alterna as pernas**. É esta
a origem de "o chute troca de perna a meio".

A guarda passou a ser por estado, que é a condição verdadeira, e o `baterFalta`
ganhou o mesmo `velocity.set(0, 0, 0)` que o penálti já tinha.

### O predicado e os seus limites

`temGestoComClip(estado)` vive no `js/fsm.js` e diz "este estado consome o
`p.actionState`". O `LATERAL` fica de fora: o arremesso tem campo próprio
(`lateralAction`), e incluí-lo mantinha vivo um `actionState` de outro gesto ao
entrar no lateral — o pendurado que o `tests/actionstate_pendurado.test.js`
existe para apanhar.

O `changeState` **não** chama o predicado, e escreve a lista por extenso. Não é
inconsistência: esse método é extraído do texto do ficheiro e avaliado isolado
por esse mesmo teste, com um ambiente fixo, e qualquer nome livre rebenta lá
com `is not defined`. Está escrito no comentário, junto ao código.

Os restantes sítios (`js/player.js:490`, `:3683`, `:3752`, `:3966`, `:4479`,
`:4702`) mantêm as suas listas, que nunca foram idênticas — o `4479` exclui
`TACKLE`, o `829` do fsm inclui `SLIDE_TACKLE`.

## Ligação aos lances

`baterFalta` (`js/player.js:1085`) e o penálti (`js/player.js:1488`) trocam o clip `'shot'` por `'playerKick'` e o estado `'SHOOT'` por `'SET_PIECE_KICK'`. Os dois já leem `ActionAnimClips[clip].contactTime` dinamicamente, portanto a corrida do `onPrepare` reajusta-se sozinha ao `contactTime` novo.

O tiro de meta do guarda-redes (`js/player.js:6896`) passa a amostrar o clip novo. O `gkKickBlend` deixa de escrever esqueleto e passa a transladar apenas o corpo até `plantX`/`plantZ`, que é a única coisa que ainda tem de fazer.

## Custo medido

A bola sai mais tarde em todos os lances: o `shot` contactava aos 0.318 s
(`duration 0.50` × `contactTime 7/11`) e o novo contacta aos 0.55 s; o tiro de
meta era 0.25 s inteiros. `SetPiecePrazos.tiroDeMeta` são 20 s e o `FREE_KICK`
tem 15 s, portanto nenhum prazo fica apertado, e em bola parada ninguém
pressiona o batedor.

O que **não** é de graça é o ritmo do jogo, e está medido na tabela da secção
da duração: a 0.70 s o jogo perdia 60% das recuperações do guarda-redes por
20 minutos e os colegas passavam a andar durante a saída de bola. Foi por isso
que a duração ficou em 0.55 s e não nos 0.70 s inicialmente escolhidos.

Não medido: a leitura do gesto sem follow-through. São 4 frames e o quarto é o
contacto, portanto a perna fica na extensão máxima quando o estado acaba e o
`resetBonesToDefault` a traz de volta. Se isso se ler seco no ecrã, a saída é
acrescentar um quinto keyframe de recuperação — não mexer nos quatro.

## Verificação

- `tests/pose_partilhada.test.js:48` e `:248` e `tests/anim_editor_export.test.js:57` têm listas de clips; o clip novo entra nelas e passa a ser exercitado pelos testes que já existem
- os guardas, confirmados um a um por `grep` depois da alteração
- a suite completa: 145 de 145 testes a passar
- o gesto visto no editor de animação, com a entrada antiga ao lado para comparação
