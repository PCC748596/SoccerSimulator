# Traçar as imagens de referência antes de escrever um clip

Este directório existe porque três versões seguidas do `GoalKickClip` foram
escritas a **adivinhar** a pose a partir das imagens de referência, e as três
saíram erradas: o jogador flutuou meio metro no ar, depois ficou deitado de
bruços a 77 graus, depois o frame do contacto ficou com as pernas a 22 graus
uma da outra — um homem parado, não um chute.

O que faltava não era medir mais. Era **olhar**: traçar o esqueleto por cima
da fotografia, ler os ângulos de lá, e depois desenhar o resultado para o
comparar com ela.

## As três ferramentas

| ficheiro | o que faz |
|---|---|
| `img.js` | lê e escreve PNG sem dependências, amplia, e desenha linhas, círculos e uma grelha de coordenadas |
| `esqueleto.js` | traça o esqueleto sobre uma imagem e imprime os ângulos de cada segmento |
| `render.js` | desenha o boneco do jogo em PNG, de lado e de costas, sem WebGL |

### 1. Ver a imagem com coordenadas

```
node img.js grelha referencias/goalkick_26.png /tmp/grelha.png 4
```

Amplia 4x e põe uma grelha (vermelha de 20 em 20, ciano de 100 em 100) nas
coordenadas da imagem ORIGINAL. É com ela que se marcam as junções.

### 2. Traçar o esqueleto e ler os ângulos

Uma ficha `.json` por imagem, com a coordenada de cada junção:

```
node esqueleto.js goalkick_26.json 4 referencias/goalkick_26_tracado.png
```

Imprime o ângulo de cada segmento face à vertical, positivo = para TRÁS do
jogador, e escreve a imagem traçada. **Se o traçado não assentar no corpo, as
coordenadas estão mal e os ângulos não valem nada** — é esse o ponto de a
imagem ser escrita.

### 3. Desenhar o resultado e comparar

```
node render.js <pasta-de-saida> <clip.json|GoalKickClip> <etiqueta>
```

Duas vistas por keyframe, `lado` e `tras`. É o passo que fecha o ciclo: sem
ele volta-se a escrever números que cumprem todas as verificações e mesmo
assim não se parecem com nada.

## Duas armadilhas, as duas já custaram uma versão

- **A vista muda de imagem para imagem.** Nas quatro imagens do tiro de meta o
  jogador vai para a esquerda; a 23 e a 25 são vistas de trás, a três quartos. Um braço estendido para o lado da
  imagem é `bracoLx` numa vista de lado e `bracoLz` numa vista de costas.
- **A ordem das imagens não se tira da distância em píxeis.** Foi assim que
  se chegou a 24, 23, 25, 26 — e estava errada: as imagens têm zooms
  diferentes, e distâncias em píxeis só se comparam dentro da mesma imagem.
  O que decide é **onde está a bola**: parada ao lado do pé de apoio é antes
  do contacto, já fora da imagem é depois. A ordem do tiro de meta é
  **24, 26, 23, 25**, confirmada pelo autor a 2 de Outubro de 2026.
- **Uma vista de trás encurta a perna que vai à frente.** A 23 é tirada de trás
  a três quartos: a perna de chute aponta para dentro da imagem e parece mais
  curta e mais vertical do que é. O ângulo lido nela (-46 graus) punha o pé
  meio metro acima da bola. No contacto manda a bola, não o traçado.
- **As fichas trazem a leitura.** Até 2 de Outubro três delas tinham os nomes
  `Chute`/`Apoio` trocados, e a 25 dizia `"frente": "direita"` — com isso a
  perna esticada lia-se atrás, e é à frente. Cada ficha tem agora um campo
  `leitura` a dizer o que se corrigiu.

## Converter um ângulo medido num canal do clip

```
coxa_rig = ângulo_medido - pitchX
joelho_rig = ângulo_da_canela - ângulo_da_coxa
```

O `pitchX` roda a anca e leva as coxas com ela — medido, `pitchX` +0.5 leva o
pé 0.426 m para trás. As restantes convenções de sinais estão no cabeçalho do
`GoalKickClip`, em `js/config/animations.js`, cada uma com a medida que a
provou.
