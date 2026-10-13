/*
=============================================================================
CONFIG: CICLOS DE LOCOMOÇÃO EXTRAÍDOS
=============================================================================
Ciclos de passada autorais, em vez dos senos do `GaitModel`. As amplitudes do
`gait.js` continuam a ser a referência e o caminho por omissão: isto só entra
quando `GaitClips.activo` for ligado, para dar para comparar lado a lado.

PROVENIÊNCIA. Extraído de `common/anime/FoxAnim/Body/body_anime_file8.mtar`
(clip `walk_1_1`), convertido de quatérnio por osso para os ângulos do rig.
A convenção de eixo é a mesma: x flexão, y rotação, z inclinação lateral.

O QUE BATE COM O `andar` E O QUE NÃO BATE, pico a pico, em radianos:

    coxa      0.71 / 0.76   contra  0.80  (2 x anca)      <- próximo
    tronco    0.077         contra  0.05                  <- próximo
    braço     0.17 / 0.38   contra  0.32  (2 x braco)     <- próximo, assimétrico
    joelho    1.08 / 1.03   contra  0.55  (joelhoOscila)  <- QUASE O DOBRO
    pé        0.59 / 0.57   contra  0.36  (2 x pe)        <- 1.6x

O joelho e o pé dobram muito mais do que o modelo de senos. Não é erro de
conversão: o seno do `getGaitPose` só dobra o joelho na fase de balanço
(`max(0, sin)`), enquanto a passada real dobra também no apoio, ao rolar o pé.

PASSADA. O clip avança 2.09 m por ciclo completo a 1.74 m/s, contra os 1.55 m
do `andar`. A cadência tem de usar este número (`animTimer += vel * dt /
passada`) ou os pés patinam: com 1.55 o ciclo corre 35% depressa de mais.

SEM RESSALTO. O root do clip não sobe nem desce — o eixo vertical é zero nos
37 frames. O `ressalto` e a `descida` continuam a vir do `misturarAndamento`,
que foi medido contra o relvado neste jogo e não se perde aqui.

COTOVELO. O rig tem um só valor para os dois cotovelos (`P.cotovelo` vai para
`lElbow` e `rElbow`), e no clip os dois braços dobram em sentidos opostos.
Fica o do braço esquerdo, que é o que tem o sinal negativo que o rig espera.
=============================================================================
*/

const GaitClips = {
    // Por omissão DESLIGADO: o caminho aprovado continua a ser o dos senos.
    activo: true,

    andar: {
        vel: 1.8,             // o andamento que este clip substitui
        passada: 2.09,        // metros por ciclo, medidos no root do clip
        fps: 30,
        frames: [
        { lHip: 0.030, rHip: -0.298, lKnee: 0.153, rKnee: 0.959, lFoot: -0.081, rFoot: 0.187, lArm: 0.337, rArm: 0.092, cotovelo: -0.407, tronco: 0.171 },
        { lHip: 0.107, rHip: -0.338, lKnee: 0.079, rKnee: 0.851, lFoot: -0.071, rFoot: 0.140, lArm: 0.337, rArm: 0.077, cotovelo: -0.455, tronco: 0.161 },
        { lHip: 0.163, rHip: -0.368, lKnee: 0.035, rKnee: 0.714, lFoot: -0.076, rFoot: 0.104, lArm: 0.349, rArm: 0.052, cotovelo: -0.502, tronco: 0.151 },
        { lHip: 0.205, rHip: -0.387, lKnee: 0.014, rKnee: 0.546, lFoot: -0.090, rFoot: 0.078, lArm: 0.360, rArm: 0.027, cotovelo: -0.550, tronco: 0.142 },
        { lHip: 0.243, rHip: -0.387, lKnee: -0.007, rKnee: 0.345, lFoot: -0.105, rFoot: 0.062, lArm: 0.361, rArm: -0.003, cotovelo: -0.598, tronco: 0.134 },
        { lHip: 0.229, rHip: -0.363, lKnee: 0.070, rKnee: 0.103, lFoot: -0.107, rFoot: 0.058, lArm: 0.348, rArm: -0.042, cotovelo: -0.645, tronco: 0.132 },
        { lHip: 0.225, rHip: -0.373, lKnee: 0.137, rKnee: 0.044, lFoot: -0.084, rFoot: 0.107, lArm: 0.321, rArm: -0.074, cotovelo: -0.683, tronco: 0.137 },
        { lHip: 0.220, rHip: -0.383, lKnee: 0.206, rKnee: 0.021, lFoot: -0.046, rFoot: 0.122, lArm: 0.306, rArm: -0.103, cotovelo: -0.711, tronco: 0.140 },
        { lHip: 0.231, rHip: -0.388, lKnee: 0.253, rKnee: 0.023, lFoot: 0.005, rFoot: 0.118, lArm: 0.293, rArm: -0.118, cotovelo: -0.732, tronco: 0.142 },
        { lHip: 0.246, rHip: -0.383, lKnee: 0.300, rKnee: 0.039, lFoot: 0.096, rFoot: 0.116, lArm: 0.282, rArm: -0.122, cotovelo: -0.742, tronco: 0.146 },
        { lHip: 0.265, rHip: -0.367, lKnee: 0.339, rKnee: 0.055, lFoot: 0.223, rFoot: 0.138, lArm: 0.278, rArm: -0.117, cotovelo: -0.738, tronco: 0.154 },
        { lHip: 0.232, rHip: -0.366, lKnee: 0.474, rKnee: 0.146, lFoot: 0.330, rFoot: 0.172, lArm: 0.282, rArm: -0.094, cotovelo: -0.716, tronco: 0.163 },
        { lHip: 0.173, rHip: -0.370, lKnee: 0.622, rKnee: 0.255, lFoot: 0.391, rFoot: 0.112, lArm: 0.291, rArm: -0.096, cotovelo: -0.677, tronco: 0.177 },
        { lHip: 0.074, rHip: -0.350, lKnee: 0.798, rKnee: 0.334, lFoot: 0.478, rFoot: 0.037, lArm: 0.313, rArm: -0.083, cotovelo: -0.626, tronco: 0.193 },
        { lHip: -0.017, rHip: -0.305, lKnee: 0.940, rKnee: 0.370, lFoot: 0.462, rFoot: -0.025, lArm: 0.345, rArm: -0.047, cotovelo: -0.561, tronco: 0.205 },
        { lHip: -0.106, rHip: -0.241, lKnee: 1.039, rKnee: 0.369, lFoot: 0.378, rFoot: -0.066, lArm: 0.381, rArm: 0.008, cotovelo: -0.484, tronco: 0.209 },
        { lHip: -0.180, rHip: -0.164, lKnee: 1.072, rKnee: 0.341, lFoot: 0.318, rFoot: -0.092, lArm: 0.414, rArm: 0.061, cotovelo: -0.415, tronco: 0.204 },
        { lHip: -0.245, rHip: -0.083, lKnee: 1.055, rKnee: 0.287, lFoot: 0.253, rFoot: -0.102, lArm: 0.436, rArm: 0.088, cotovelo: -0.348, tronco: 0.193 },
        { lHip: -0.305, rHip: -0.010, lKnee: 1.002, rKnee: 0.234, lFoot: 0.189, rFoot: -0.103, lArm: 0.446, rArm: 0.120, cotovelo: -0.291, tronco: 0.180 },
        { lHip: -0.357, rHip: 0.054, lKnee: 0.912, rKnee: 0.189, lFoot: 0.132, rFoot: -0.105, lArm: 0.448, rArm: 0.159, cotovelo: -0.242, tronco: 0.168 },
        { lHip: -0.393, rHip: 0.112, lKnee: 0.783, rKnee: 0.145, lFoot: 0.084, rFoot: -0.107, lArm: 0.446, rArm: 0.198, cotovelo: -0.202, tronco: 0.159 },
        { lHip: -0.411, rHip: 0.164, lKnee: 0.619, rKnee: 0.112, lFoot: 0.045, rFoot: -0.114, lArm: 0.434, rArm: 0.224, cotovelo: -0.173, tronco: 0.153 },
        { lHip: -0.401, rHip: 0.215, lKnee: 0.397, rKnee: 0.080, lFoot: 0.031, rFoot: -0.118, lArm: 0.423, rArm: 0.251, cotovelo: -0.143, tronco: 0.150 },
        { lHip: -0.365, rHip: 0.269, lKnee: 0.137, rKnee: 0.042, lFoot: 0.036, rFoot: -0.122, lArm: 0.411, rArm: 0.255, cotovelo: -0.125, tronco: 0.146 },
        { lHip: -0.389, rHip: 0.311, lKnee: 0.027, rKnee: 0.025, lFoot: 0.019, rFoot: -0.108, lArm: 0.399, rArm: 0.247, cotovelo: -0.107, tronco: 0.143 },
        { lHip: -0.425, rHip: 0.353, lKnee: 0.005, rKnee: 0.023, lFoot: 0.060, rFoot: -0.077, lArm: 0.383, rArm: 0.236, cotovelo: -0.098, tronco: 0.140 },
        { lHip: -0.442, rHip: 0.376, lKnee: 0.037, rKnee: 0.053, lFoot: 0.077, rFoot: -0.026, lArm: 0.380, rArm: 0.222, cotovelo: -0.090, tronco: 0.146 },
        { lHip: -0.428, rHip: 0.373, lKnee: 0.045, rKnee: 0.133, lFoot: 0.142, rFoot: 0.058, lArm: 0.396, rArm: 0.202, cotovelo: -0.093, tronco: 0.148 },
        { lHip: -0.431, rHip: 0.351, lKnee: 0.159, rKnee: 0.248, lFoot: 0.127, rFoot: 0.176, lArm: 0.418, rArm: 0.177, cotovelo: -0.097, tronco: 0.154 },
        { lHip: -0.396, rHip: 0.312, lKnee: 0.202, rKnee: 0.390, lFoot: 0.165, rFoot: 0.291, lArm: 0.423, rArm: 0.150, cotovelo: -0.108, tronco: 0.167 },
        { lHip: -0.362, rHip: 0.229, lKnee: 0.265, rKnee: 0.584, lFoot: 0.095, rFoot: 0.402, lArm: 0.408, rArm: 0.128, cotovelo: -0.130, tronco: 0.182 },
        { lHip: -0.319, rHip: 0.128, lKnee: 0.311, rKnee: 0.778, lFoot: 0.031, rFoot: 0.452, lArm: 0.393, rArm: 0.112, cotovelo: -0.161, tronco: 0.195 },
        { lHip: -0.268, rHip: 0.026, lKnee: 0.326, rKnee: 0.917, lFoot: -0.017, rFoot: 0.383, lArm: 0.372, rArm: 0.113, cotovelo: -0.201, tronco: 0.194 },
        { lHip: -0.208, rHip: -0.075, lKnee: 0.318, rKnee: 1.009, lFoot: -0.051, rFoot: 0.334, lArm: 0.351, rArm: 0.115, cotovelo: -0.252, tronco: 0.194 },
        { lHip: -0.137, rHip: -0.178, lKnee: 0.286, rKnee: 1.049, lFoot: -0.073, rFoot: 0.299, lArm: 0.333, rArm: 0.115, cotovelo: -0.304, tronco: 0.188 },
        { lHip: -0.060, rHip: -0.241, lKnee: 0.239, rKnee: 1.026, lFoot: -0.088, rFoot: 0.248, lArm: 0.330, rArm: 0.104, cotovelo: -0.356, tronco: 0.182 },        ]
    }
};
