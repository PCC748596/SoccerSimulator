# Utility AI (Nível 4: Tomada de Decisão com Bola)

O `UtilityAI` é o núcleo da tomada de decisão tática de baixo nível do Soccer Simulator. Enquanto os Behavior Trees definem a estratégia macro (equipa, posicionamento e estilos), o Utility AI entra em ação exclusivamente quando um jogador tem a posse de bola.

## Conceito Fundamental
O modelo utiliza uma abordagem baseada em pontuação (scoring). Em vez de seguir scripts estáticos do tipo "se X então Y", o sistema avalia todas as opções possíveis em tempo real e escolhe a que maximiza a recompensa esperada.

A cada ciclo de decisão, o motor analisa:
1. **Passes (Passe Curto / Passe Longo)**: Avalia todos os colegas de equipe disponíveis. Considera a distância, a presença de adversários na linha de passe, a progressão no terreno e a proximidade da baliza adversária.
2. **Lançamentos / Bolas Descobertas (Through Balls)**: Procura espaços vazios nas costas da defesa adversária onde o recetor possa correr para intercetar a bola antes do guarda-redes ou defesas.
3. **Cruzamentos (Crosses)**: Se o jogador estiver na ala (flancos), avalia a presença de pontas-de-lança na grande área e a trajetória do cruzamento.
4. **Remates (Shoots)**: Avalia a probabilidade de golo. Fatores como distância, ângulo, bloqueios de defesas no caminho e posicionamento do guarda-redes afetam drasticamente a nota do remate.
5. **Condução de Bola (Dribble / Carry)**: Se nenhuma opção de passe ou remate for considerada viável ou se o jogador tiver campo aberto à sua frente, a utilidade de reter a bola e progredir torna-se a decisão dominante.

## Fatores de Pontuação
O cálculo das notas de cada ação baseia-se num sistema de bónus e penalizações:
- **Linha de Visão e Interceções**: A presença de defesas no corredor de passe reduz exponencialmente a utilidade da ação.
- **Progressão**: Passes para a frente recebem um bônus de "progressão ofensiva", enquanto passes para trás recebem penalizações suaves (servem como válvula de escape para manutenção de posse).
- **Spatial Grid**: O mapa de ameaças táticas é consultado. Zonas de alta pressão defensiva desencorajam decisões arriscadas, exceto para estilos de jogo criativos.
- **Atributos dos Jogadores**: A precisão e a capacidade de visão do jogador modificam as curvas de pontuação. Um `Playmaker` verá utilidade em passes rasgados que um defesa central consideraria demasiado arriscados.

## Ruído e Aleatoriedade
Para evitar que o jogo pareça mecânico ou perfeitamente previsível, o Utility AI introduz "ruído de decisão". As notas finais sofrem uma pequena variação aleatória. Isso significa que duas situações táticas idênticas podem resultar em decisões diferentes (ex: o jogador pode optar por rematar em vez de passar para o colega desmarcado, simulando o fator humano do futebol real).
