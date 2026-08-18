# Nível 1: TeamBT (Behavior Tree de Equipa)

**Ficheiro principal:** `js/bt/team_bt.js`

O **TeamBT** atua como o **cérebro coletivo** da equipa. Em vez de avaliar jogadores individualmente, este nível de Inteligência Artificial corre apenas **uma vez por equipa, a cada frame**.

A sua única função é ler o estado global do jogo e preencher o **`TeamBlackboard`** (o quadro-negro da equipa) com diretrizes globais e contextuais. Os níveis inferiores (PositionBT e PlayerBT) vão consultar este quadro para tomarem as suas decisões individuais.

## Responsabilidades Principais

1. **Reconhecimento de Fases do Jogo:**
   - Determina se a equipa está **Com Bola** (`isAttacking`) ou **Sem Bola**.
   - Analisa as entrelinhas e a profundidade ("Será que temos espaço aberto à nossa frente?").
   
2. **Definição da Linha Defensiva:**
   - Calcula onde deve estar a linha de defesa face à localização da bola e à presença dos avançados adversários.
   - Pressionar alto, bloco médio ou recuar em bloco baixo.

3. **Avisos Coletivos (Alertas):**
   - **Basculação (`flankAlert`):** Deteta se o adversário está a atacar de forma perigosa por um dos corredores laterais. Se sim, emite um alerta para toda a equipa deslizar lateralmente e fechar esse flanco.
   - **Identificação do Portador:** Regista qual o jogador adversário que tem a bola (`oppCarrier`) para orientar a marcação e as dinâmicas de contenção.

4. **Atribuição de Papéis Temporários:**
   - **Apoio na Construção (`supportMid`):** Escolhe qual o médio que deve recuar para dar uma linha de passe de segurança na saída de bola, libertando os defesas de pressão.

## O Que o TeamBT *Não* Faz
- Não move os jogadores no relvado.
- Não decide quem faz o desarme ou remata.
- Não define as coordenadas exatas da formação.

**Em resumo:** O TeamBT diz à equipa *o que está a acontecer no jogo*.

---

### Estrutura da Árvore (Código)

```javascript
const TeamBT = sel('TeamRoot',
    // 1. Bola parada suspende o plano normal.
    seq('BolaParada',
        cond('jogoParado', () => Match.state !== 'PLAY'),
        setPosture(TeamPosture.SET_PIECE)
    ),

    // 2. Com bola: qual a fase da manobra ofensiva?
    seq('ComBola',
        cond('temPosse', (bb) => bb.isAttacking),
        sel('FaseOfensiva',
            seq('Transicao',
                cond('emContraAtaque', (bb) => bb.isCounter),
                setPosture(TeamPosture.COUNTER)
            ),
            seq('UltimoTerco',
                cond('bolaNoUltimoTerco', (bb) => bb.ballZ * bb.dir > 17.0),
                setPosture(TeamPosture.FINAL_THIRD)
            ),
            seq('PosseInstalada',
                cond('posseProlongada', (bb) => bb.phase >= 2),
                setPosture(TeamPosture.ATTACK_SUSTAINED)
            ),
            setPosture(TeamPosture.BUILD_UP)
        )
    ),

    // 3. Sem bola: que bloco defensivo?
    seq('SemBola',
        act('lerAmeacaDeFlanco', detectFlankThreat),
        sel('BlocoDefensivo',
            seq('Basculacao',
                cond('flancoEmPerigo', (bb) => bb.flankAlert !== null),
                setPosture(TeamPosture.FLANK_SHIFT)
            ),
            seq('BlocoBaixo',
                cond('bolaNoNossoTerco', (bb) => bb.ballZ * bb.dir < -17.0),
                setPosture(TeamPosture.LOW_BLOCK)
            ),
            seq('PressaoAlta',
                // Precisa do Estilo=Ataque E do Defensive Pressure em High
                cond('pressionamosAlto', (bb) =>
                    (Tatics.estilo === 'ataque' || Tatics.estilo === 'muito_ofensiva') && Tatics.pressaoDefensiva === 'high' && bb.ballZ * bb.dir > 0),
                setPosture(TeamPosture.HIGH_PRESS)
            ),
            setPosture(TeamPosture.MID_BLOCK)
        )
    )
);
```
