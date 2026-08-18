# Nível 3: PlayerBT (Behavior Tree Individual)

**Ficheiro principal:** `js/bt/player_bt.js`

O **PlayerBT** é o **cérebro individual** do jogador (onde está a "vontade própria" dele). Corre **uma vez por cada jogador a cada frame**, sendo o último nível da hierarquia.

A pergunta a que este nível responde é: **"Tendo em conta o que a equipa quer (TeamBT) e onde me mandaram colocar (PositionBT), *o que vou fazer com o meu corpo agora mesmo*?"**

É aqui que o jogador decide: chutar, cruzar, fazer um carrinho, passar a bola, ou correr para receber.

---

### Estrutura Parcial da Árvore (Código)

```javascript
const PlayerBT = sel('PlayerRoot',

    /* --- Bola parada ---------------------------------------------------- */
    seq('BolaParada',
        cond('jogoParado', () => Match.state !== 'PLAY'),
        act('esperarLance', (ctx) => { /* ... */ })
    ),

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

            // Guarda-redes: sair a jogar curto, senão lançamento longo.
            seq('GuardaRedesJoga',
                cond('souGR', ehGK),
                sel('OpcaoGR', /* ... */ )
            ),

            // Remate, se estiver em zona e ângulo de finalizar.
            seq('Rematar',
                cond('emZonaDeRemate', emZonaDeRemate),
                act('rematar', actShoot)
            ),
            
            // Cruzamento da ala, se houver alguém na área para o receber.
            seq('Cruzar',
                cond('valeCruzar', (ctx) => { /* ... */ }),
                act('cruzar', actCross)
            ),
            
            // Conduzir em espaço livre
            seq('ConduzirEmEspaco',
                cond('campoAberto', (ctx) => ctx.p.role !== 'gk' && ctx.campoAberto),
                act('atacarOEspaco', actCarry)
            ),

            // Driblar adversário próximo
            seq('Driblar',
                cond('podeDriblar', podeDriblar),
                act('driblar', actDribble)
            ),
            
            // Lançamento / Passe curto (Frente/Lado/Trás)
            seq('PassarFrente', /* ... */),
            seq('PassarLado', /* ... */),
            seq('PassarTras', /* ... */),
            
            // Chute lateral (alívio)
            seq('ChuteLateral', /* ... */),
            
            // Se falharem todas as opções anteriores, arranca com a bola!
            act('conduzir', actCarry)
        )
    ),

    /* --- Sem bola -------------------------------------------------------- */
    seq('SemBola',
        sel('DecisaoSemBola',
            // Carrinho, Desarme, Intercetar, IrABola, Receber, GuardaRedes, AtacarArea...
            // ... (Lógicas de desarmes, intercepções, e acompanhamento de linha defensiva)
            act('ocuparPosicao', actHoldPosition)
        )
    )
);
```
