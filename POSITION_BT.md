# Nível 2: PositionBT (Behavior Tree de Posicionamento)

**Ficheiro principal:** `js/bt/position_bt.js`

O **PositionBT** é o **cérebro tático individual**. Esta árvore corre **uma vez por cada jogador de campo a cada frame**, logo depois de o `TeamBT` ter terminado a sua avaliação.

Esta árvore tem apenas um único objetivo e responde a apenas uma pergunta matemática:
**"Dado o plano coletivo atual da equipa e a minha posição tática específica (CB, CM, RW, etc.), onde devo estar no campo neste exato momento?"**

O output final desta árvore é uma coordenada `X` e `Z`, escrita na propriedade `p.dynamicTarget` do jogador.

## Arquitetura de Especialização
Apesar de ser apenas **uma única árvore** para todos os jogadores, a sua raiz possui um nó de seleção (um género de cruzamento) que separa o fluxo de execução dependendo da posição do jogador:

```javascript
sel('PorPosicao',
    seq('Trinco', cond('eTrinco', isPos('DM')), act('subirComoTrinco', ...)),
    seq('Central', cond('eCentral', isPos('CB')), act('subirComoCentral', ...)),
    seq('Lateral', cond('eLateral', isPos('LB', 'RB')), act('subirNoCorredor', ...)),
    // ...
)
```

## Como funciona?

1. **Com Bola:**
   - Cada posição dita a sua forma de ocupar o espaço. Os **Laterais** abrem nos corredores para dar largura. Os **Centrais** preparam-se para cobrir possíveis perdas de bola. Os **Interiores/Avançados** movem-se na entrelinha ou atacam o espaço nas costas da defesa.
   - Aplica os cálculos matemáticos específicos para a geometria da equipa ofensiva.

2. **Sem Bola:**
   - Consulta os avisos do `TeamBlackboard` (criados no Nível 1).
   - Se houver um alerta de **Basculação**, a árvore desvia o jogador lateralmente para tapar o lado perigoso.
   - Caso contrário, os Defesas acompanham a linha calculada pela equipa, os Trincos tapam o funil central e os Médios pressionam ou mantêm o bloco zonal.

## O Que o PositionBT *Não* Faz
- Não ordena chutar, passar a bola, ou intercetar um passe (isso é função do Nível 3 - `PlayerBT`).
- Não move fisicamente o boneco com a animação (isso é a máquina de estados `PlayerFSM`).
- Apenas escreve o "Alvo Fantasma" invisível (`dynamicTarget`) para o qual o jogador tentará caminhar/correr.

---

### Estrutura da Árvore (Código)

```javascript
const PositionBT = sel('PositionRoot',
    // Com bola: cada posição tem uma forma própria de ocupar o campo.
    seq('Ofensivo',
        cond('equipaTemPosse', (ctx) => ctx.bb.isAttacking),
        sel('PorPosicao',
            seq('ApoioNaConstrucao',
                cond('souOApoio', (ctx) => ctx.p === ctx.bb.supportMid),
                act('descerParaReceber', supportBuildUp)
            ),
            seq('Trinco', cond('eTrinco', isPos('DM')), act('subirComoTrinco', attackDM)),
            seq('Central', cond('eCentral', isPos('CB')), act('subirComoCentral', attackCB)),
            seq('Lateral', cond('eLateral', isPos('LB', 'RB')), act('subirNoCorredor', attackFullBack)),
            seq('Interior', cond('eInterior', isPos('CM', 'AM')), act('ocuparEntreLinhas', attackCentralMid)),
            seq('MedioAla', cond('eMedioAla', isPos('RM', 'LM')), act('abrirNaAla', attackWideMid)),
            seq('Avancado', cond('eAvancado', isPos('CF', 'RW', 'LW')), act('atacarArea', attackForward)),
            act('posicaoGenerica', attackGeneric)
        )
    ),

    // Sem bola: o plano colectivo manda primeiro (basculação), depois a posição.
    seq('Defensivo',
        sel('PorSituacao',
            seq('Basculacao',
                cond('equipaBascula', (ctx) => ctx.bb.flankAlert !== null && ctx.bb.oppCarrier !== null),
                act('bascularParaFlanco', defendFlankShift)
            ),
            seq('Lateral', cond('eLateral', isPos('LB', 'RB')), act('defenderCorredor', defendFullBack)),
            seq('Central', cond('eCentral', isPos('CB')), act('defenderEixo', defendCB)),
            seq('Trinco', cond('eTrinco', isPos('DM')), act('taparMeio', defendDM)),
            act('blocoZonal', defendZonal)
        )
    )
);
```
