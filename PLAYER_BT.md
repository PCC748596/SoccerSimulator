# Nível 3: PlayerBT (Behavior Tree Individual)

**Ficheiro principal:** `js/bt/player_bt.js`

O **PlayerBT** é o **cérebro individual** do jogador (onde está a "vontade própria" dele). Corre **uma vez por cada jogador a cada frame**, sendo o último nível da hierarquia.

A pergunta a que este nível responde é: **"Tendo em conta o que a equipa quer (TeamBT) e onde me mandaram colocar (PositionBT), *o que vou fazer com o meu corpo agora mesmo*?"**

É aqui que o jogador decide: chutar, cruzar, fazer um carrinho, passar a bola, ou correr para receber.

---

### Estrutura Parcial da Árvore (Código)

```javascript
const PlayerBT = sel('PlayerRoot',

    /* --- Acção em curso: não voltar a decidir ---------------------------- */
    seq('AccaoEmCurso',
        cond('estadoBloqueante', (ctx) => {
            const s = ctx.p.fsm.currentState;
            return s === 'PASS' || s === 'SHOOT' || s === 'TACKLE' || s === 'SLIDE_TACKLE' ||
                s === 'CUT' || s === 'CHEST_CONTROL';
        }),
        act('deixarTerminar', () => { })
    ),

    /* --- Com bola -------------------------------------------------------- */
    seq('ComBola',
        cond('tenhoABola', temBola),
        sel('DecisaoComBola',
            seq('RecuperarControlo',
                cond('bolaFugiu', (ctx) => !ctx.p.hasBall),
                act('correrParaBola', actCarry)
            ),
            
            // ... (Cálculo de Janela de Decisão / Domínio) ...

            // Remate, se estiver em zona e ângulo de finalizar.
            seq('Rematar',
                cond('emZonaDeRemate', emZonaDeRemate),
                act('rematar', actShoot)
            ),
            
            // Cruzamento da ala, se houver alguém na área para o receber.
            seq('Cruzar',
                cond('valeCruzar', (ctx) => { ... }),
                act('cruzar', actCross)
            ),
            
            // Lançamento nas costas da linha adversária.
            seq('Lancar',
                cond('haEspacoNasCostas', (ctx) => { ... }),
                act('lancar', actThroughBall)
            ),
            
            // Passe curto ou desmarcação
            seq('Passar',
                cond('haPasse', (ctx) => { ... }),
                act('passar', actPass)
            ),
            
            // Se falharem todas as opções anteriores, arranca com a bola!
            act('conduzir', actCarry)
        )
    ),

    /* --- Sem bola -------------------------------------------------------- */
    seq('SemBola',
        sel('DecisaoSemBola',
            // ... (Lógicas de desarmes, intercepções, e acompanhamento de linha defensiva)
        )
    )
);
```
