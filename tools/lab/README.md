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
| `lote_tmp.js` | lote de jogos completos, para estatística sobre várias partidas | nº de jogos (4), duração em segundos (1080) |

## Cuidado com a leitura

A simulação é caótica: uma semente vale pouco sozinha, e duas corridas do mesmo
script com o mesmo número de remates dão números diferentes. O `lab_gk.js` é
usado com semente fixa por essa razão — ver o cabeçalho de
[`tests/gk_varre_o_trajecto.test.js`](../../tests/gk_varre_o_trajecto.test.js),
que traz três sementes de 300 remates lado a lado. Uma diferença só conta
quando sobrevive a mudar a semente.
