# `tools/lab/` — medir o jogo sem o abrir

Scripts que correm o jogo REAL sem browser, através do
[`tools/headless/harness.js`](../headless/harness.js), e imprimem uma medição.
Estavam todos soltos na raiz do projecto.

Não fazem parte do jogo nem dos testes: nada em `js/`, `tests/` ou `index.html`
os carrega. Mas também não são rascunho gasto — são ferramentas de medição
parametrizadas, feitas para voltar a correr quando a pergunta reaparecer. É
isso que os separa de [`tools/scratch/`](../scratch/README.md), que é código de
um só uso e pode ser apagado inteiro.

## Como se corre

```
node tools/lab/<script>.js [argumentos]
```

O harness resolve a raiz do projecto sozinho (`__dirname/../..`), portanto o
directório de onde se chama não importa.

| script | o que mede | argumentos |
|---|---|---|
| `lab_gk.js` | laboratório do guarda-redes: N remates de posições sorteadas dentro e à volta da área, com o pipeline real (`tipoDeRemate` → `miraDeRemate` → sigma → física → GK), e conta os desfechos | nº de remates (300) |
| `lab_mira.js` | onde é que se MIRA contra onde a bola acaba por ir | nº de remates (2000) |
| `diag_run.js` | porque morre a corrida ao espaço: reavalia por frame as condições de aborto do `case 'RUN_INTO_SPACE'` e regista qual era verdadeira quando o jogador saiu | segundos de jogo |
| `infil_lanc.js` | infiltrações que receberam bola: conta cada arranque de `RUN_INTO_SPACE` e vê se aquele jogador chegou a ser destinatário de um passe e a tocar na bola | segundos de jogo |
| `diag_inf.js` | porque é que o ramo do passe para quem infiltra quase nunca dispara | segundos de jogo (300) |
| `diag_inf2.js` | segunda passagem sobre a mesma pergunta do `diag_inf.js` | segundos de jogo (300) |
| `adiantar_a_bola.js` | posses de atacante no meio-campo adversário: quanto espaço tinha à frente, se entrou em condução e quantos metros progrediu | segundos (600), semente (1) |
| `cabeceio_na_area.js` | cabeceios dentro da grande área: quantos vão à baliza e quantos saem em passe, por distância | segundos (900), semente (1), nº forçados (400), `--marcado` |
| `impedimento.js` | impedimentos assinalados: recalcula a Lei 11 com tudo congelado no instante do passe e compara com o que se vê quando o apito chega | segundos (1800), semente (1) |
| `falta_pelas_costas.js` | faltas de contacto: quem foi marcado infractor e de que lado veio o toque | segundos (1800), semente (1) |
| `dois_toques.js` | reposições em que o próprio batedor voltou a tocar na bola antes de outro jogador — a regra dos dois toques | segundos (600), semente (1), `--forcar`, `--sem-regra` |
| `lote_tmp.js` | lote de jogos completos, para estatística sobre várias partidas | nº de jogos (4), duração em segundos (1080) |

## Cuidado com a leitura

A simulação é caótica: uma semente vale pouco sozinha, e duas corridas do mesmo
script com o mesmo número de remates dão números diferentes. O `lab_gk.js` é
usado com semente fixa por essa razão — ver o cabeçalho de
[`tests/gk_varre_o_trajecto.test.js`](../../tests/gk_varre_o_trajecto.test.js),
que traz três sementes de 300 remates lado a lado. Uma diferença só conta
quando sobrevive a mudar a semente.

## Quando o defeito não aparece sozinho

O `dois_toques.js` tem um modo `--forcar` que vale a pena conhecer, porque o
problema que resolve é geral: **um defeito relatado pode ser raro de mais para
aparecer numa simulação**.

O segundo toque do batedor foi relatado de um jogo a sério, mas em 30 minutos
de jogo simulado e 75 reposições não apareceu uma única vez — é preciso que a
bola volte ao pé de quem a repôs, e isso não acontece de encomenda. Medir jogo
livre dava zero antes e zero depois da correcção, o que não prova nada.

Com `--forcar`, a bola é posta em cima do batedor meio segundo depois de ele a
repor. A condição passa a existir sempre, e aí a diferença mede-se:

```
300 s, semente 1        reposicoes   com 2o toque
  antes da correccao        14             10
  depois da correccao       10              0
```

A lição: quando a medição em jogo livre dá o mesmo antes e depois, o problema
costuma ser a **frequência do cenário**, não a ausência do defeito. Criar a
condição vale mais do que correr mais horas à espera dela.

## Medir o jogo com a conta do jogo

O `adiantar_a_bola.js` replica a conta do espaço à frente que o `PlayerContext`
faz, e isso é uma armadilha conhecida: na primeira versão trazia a fórmula
**copiada**, e quando o jogo passou a calcular o corredor de outra maneira a
medição continuou a medir a antiga. O resultado deu a entender que a correcção
não tinha feito nada — zero posses com espaço, antes e depois.

Onde a medição precisar de repetir uma conta do jogo, lê a CONSTANTE do jogo
(aqui, `CarryModel.aberturaCorredor`) em vez de copiar a fórmula. O que
sobrar de duplicado fica a divergir em silêncio.

## Medir no instante certo

O `impedimento.js` começou a medir a Lei 11 recalculando a linha do penúltimo
defesa **no momento do apito**, e comparando-a com a posição congelada do
atacante. Isso não é regra nenhuma: compara o instante de um com o instante dos
outros. Deu 0 erros, mas por acaso.

Congelada também a linha — como a Lei manda — a medição passou a separar duas
coisas que estavam misturadas: a decisão (certa em 26 de 26) e o que se vê
quando o apito chega (35% já não parecem impedidos). Foi essa separação que
mostrou que o problema era de apresentação e não de regra.

Quando uma medição replica uma regra, tem de replicar também **o instante em
que a regra é avaliada**.
