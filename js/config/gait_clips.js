/*
=============================================================================
CONFIG: CICLOS DE LOCOMOÇÃO EXTRAÍDOS
=============================================================================
Ciclos de passada autorais, um por andamento, em vez dos senos do `GaitModel`.
As amplitudes do `gait.js` continuam a ser a referência: isto só entra quando
`GaitClips.activo` for ligado, e desligado o jogo fica exactamente como estava.

PROVENIÊNCIA. Extraído de `common/anime/FoxAnim/Body/*.mtar`, convertido de
quatérnio por osso para os ângulos do rig. A convenção de eixo é a mesma do
`joint_limits.js`: x flexão, y rotação, z inclinação lateral. Os quatro clips
fecham o ciclo com erro medido de 0.000 — o último frame é igual ao primeiro,
por isso foi retirado e o `amostrarClipGait` dá a volta sozinho.

A ESCADA. Cada entrada fica na velocidade do andamento que substitui, não na
velocidade a que o clip foi gravado. O `run_3_3` anda a 5.05 m/s e entra no
`trote`, que é 4.5: a cadência resolve isso sozinha, porque usa a `passada` do
clip (`animTimer += vel * dt / passada`) e não a velocidade de gravação.

A PELVE FOI DOBRADA NAS COXAS E NO TRONCO. O rig não tem pelve no ciclo de
passada — o `getGaitPose` escreve coxas, joelhos, pés, braços, cotovelos e
peito, e mais nada. O original inclina a pelve (+0.17 rad no trote), e é dela
que as coxas e o tronco dependem. Descartá-la deixava as coxas fletidas de mais
e a oscilação torta: o `trote` ia de -0.91 a +0.32 em vez de ir de -0.67 a
+0.61. Somada aos filhos que o rig tem, a oscilação fica simétrica e o desvio
de postura fica igual (-0.16 rad) nos quatro andamentos, em vez de saltar entre
-0.11 e -0.31.

POSTURA. Sobra um desvio constante de -0.16 rad (9 graus) com as coxas à
frente, em todos os andamentos. É a postura atlética do original e não é erro
de conversão: as rotações de bind do esqueleto são todas identidade (medido).
O modelo de senos oscila em torno de zero. Para o neutralizar bastava subtrair
a média de cada clip, mas isso é decisão de quem afina, não da extração.

AMPLITUDE DA COXA, pico a pico, contra `2 x anca` do modelo:

    parado   0.26  contra  0.00    <- o modelo congela, o clip respira
    andar    0.70  contra  0.80
    trote    1.28  contra  1.34
    correr   1.52  contra  1.94    <- o clip abre menos as pernas

JOELHO. Dobra bem mais do que o seno em todos os andamentos (andar 1.07 contra
0.61, trote 1.77 contra 1.27). Não é erro de conversão: o `poseDeSenos` só
dobra o joelho na fase de balanço (`max(0, sin)`), e a passada real dobra
também no apoio, ao rolar o pé.

O CORPO ASSENTA MAIS BAIXO A CORRER. Com o clip, a perna recolhe mais no voo e
o ponto mais baixo do boneco sobe: medido com `tools/scratch/altura_corpo_clip.js`,
a 8 m/s a mediana fica 4.2 cm acima do sítio onde as botas assentam de pé, e o
pico chega a 9.1 cm. Relato: *"o jogador está um pouco acima do solo na corrida.
Uns 10 cms"*.

O `descidaExtra` corrige o corpo para a mediana voltar ao contacto. É um
deslocamento com sinal: positivo baixa, negativo levanta.

A correr baixa 4.2 cm (estava a flutuar). No trote faz o contrário — ali a
mediana estava a -0.086, ou seja 3.6 cm ENTERRADA no relvado, e sobe outro
tanto. Nos dois andamentos lentos o desvio é de 1 cm, abaixo do que se vê, e
ficam a zero.

Não substitui a `descida` do `GaitModel`, soma-se a ela: aquela foi medida para
o modelo de senos e continua a valer quando o clip está desligado.

SEM RESSALTO. O root dos clips não sobe nem desce — o eixo vertical é zero em
todos os frames. O `ressalto` e a `descida` continuam a vir do
`misturarAndamento`, que foi medido contra o relvado deste jogo.

ABERTURA DA PERNA AFINADA À MÃO. O `ancaGanho` multiplica a oscilação da coxa
em torno da `ancaMedia`, sem mexer na postura. Serve para afastar o clip da
medida do original quando ela não serve ao jogo.

A correr o clip abre 1.51 rad pico a pico e o modelo de senos abre 1.94
(2 x anca). Pedido: *"pode usar um pouco mais: 1.72"* — ganho 1.136, que fica
entre os dois. Os outros andamentos ficam a 1.0, na medida do original.

Os braços seguem, porque são derivados da coxa (ver abaixo): mais abertura de
perna dá mais balanço de braço, na mesma proporção.

A `passada` NÃO muda com isto. No modelo de senos a abertura (`anca`) e o
avanço por ciclo (`passada`) também são afinados em separado — a medição do
`tools/scratch/passada_abertura.js` lê a distância pé-a-pé, não o avanço. Abrir
a perna sem alongar a passada faz o pé viajar mais para o mesmo avanço, e a
partir de certo ponto isso lê-se como patinagem. A 1.72 ainda está abaixo do
que o modelo já fazia a 1.94, por isso não introduz nada que não existisse.

BRAÇOS DERIVADOS DAS PERNAS. Os canais de braço do original vêm incompletos —
no PES os braços são movidos por cadeias de IK e só parte do movimento está nos
canais. Mede-se: a andar, o braço esquerdo oscila 0.17 e o direito 0.38, uma
assimetria de 2x que não existe numa passada real, e o rácio braço/perna fica em
0.24 contra os 0.40 do modelo de senos. No sprint é pior: 0.38 contra 1.03.

Por isso os braços NÃO vêm do clip. São derivados da perna oposta, que é o que
acontece numa passada: braço esquerdo com perna direita. O `bracoGanho` é o
rácio `braco / anca` do andamento correspondente do `GaitModel`, portanto o
balanço fica igual ao que já estava afinado — o que muda é que agora segue o
tempo real da perna em vez de um seno.

A `ancaMedia` é o desvio de postura do clip (as coxas à frente, ver acima). É
subtraída antes de derivar o braço, senão a postura entrava no balanço e os dois
braços ficavam puxados para o mesmo lado.

COTOVELO. O rig tem um só valor para os dois cotovelos (`P.cotovelo` vai para
`lElbow` e `rElbow`), e no clip os dois braços dobram em sentidos opostos.
Fica o do braço esquerdo, que é o que traz o sinal negativo que o rig espera.
=============================================================================
*/

const GaitClips = {
    // Ligar para comparar com os senos. Desligado, nada no jogo muda.
    activo: true,

    /*
    Os andamentos, por velocidade crescente. O `getGaitPose` procura o par que
    cerca a velocidade pedida e interpola entre os dois, tal como o
    `misturarAndamento` faz com as amplitudes.
    */
    escada: [
        {
        // parado — de pé, parado — o balanço de quem espera (42 frames)
        nome: 'idle',
        descidaExtra: 0,    // quanto o corpo baixa, alem da `descida` do GaitModel
        ancaGanho: 1.0,      // multiplica a abertura da coxa (1.0 = a do original)
        bracoGanho: 0.4,     // braco / anca deste andamento no GaitModel
        ancaMedia: -0.2085,    // desvio de postura do clip, retirado antes de derivar o braco
        vel: 0.0,
        passada: 1.55,          // metros por ciclo, medidos no root do clip
        fps: 30,
        frames: [
            { lHip: -0.251, rHip: -0.307, lKnee: 0.480, rKnee: 0.559, lFoot: -0.153, rFoot: -0.179, lArm: 0.080, rArm: 0.134, cotovelo: -0.548, tronco: 0.324 },
            { lHip: -0.188, rHip: -0.239, lKnee: 0.337, rKnee: 0.410, lFoot: -0.038, rFoot: -0.062, lArm: 0.109, rArm: 0.146, cotovelo: -0.580, tronco: 0.318 },
            { lHip: -0.171, rHip: -0.168, lKnee: 0.272, rKnee: 0.252, lFoot: 0.100, rFoot: 0.103, lArm: 0.130, rArm: 0.145, cotovelo: -0.612, tronco: 0.316 },
            { lHip: -0.146, rHip: -0.116, lKnee: 0.206, rKnee: 0.122, lFoot: 0.195, rFoot: 0.262, lArm: 0.137, rArm: 0.145, cotovelo: -0.644, tronco: 0.308 },
            { lHip: -0.142, rHip: -0.094, lKnee: 0.232, rKnee: 0.056, lFoot: 0.154, rFoot: 0.348, lArm: 0.140, rArm: 0.148, cotovelo: -0.658, tronco: 0.298 },
            { lHip: -0.148, rHip: -0.144, lKnee: 0.293, rKnee: 0.164, lFoot: 0.116, rFoot: 0.267, lArm: 0.144, rArm: 0.156, cotovelo: -0.661, tronco: 0.288 },
            { lHip: -0.160, rHip: -0.194, lKnee: 0.355, rKnee: 0.284, lFoot: 0.117, rFoot: 0.181, lArm: 0.149, rArm: 0.164, cotovelo: -0.656, tronco: 0.282 },
            { lHip: -0.166, rHip: -0.227, lKnee: 0.407, rKnee: 0.382, lFoot: 0.032, rFoot: 0.087, lArm: 0.148, rArm: 0.172, cotovelo: -0.641, tronco: 0.276 },
            { lHip: -0.164, rHip: -0.245, lKnee: 0.437, rKnee: 0.444, lFoot: -0.118, rFoot: -0.039, lArm: 0.140, rArm: 0.188, cotovelo: -0.609, tronco: 0.273 },
            { lHip: -0.187, rHip: -0.272, lKnee: 0.499, rKnee: 0.506, lFoot: -0.244, rFoot: -0.163, lArm: 0.135, rArm: 0.200, cotovelo: -0.545, tronco: 0.273 },
            { lHip: -0.232, rHip: -0.301, lKnee: 0.583, rKnee: 0.560, lFoot: -0.281, rFoot: -0.222, lArm: 0.108, rArm: 0.218, cotovelo: -0.483, tronco: 0.278 },
            { lHip: -0.226, rHip: -0.295, lKnee: 0.568, rKnee: 0.543, lFoot: -0.275, rFoot: -0.210, lArm: 0.084, rArm: 0.226, cotovelo: -0.459, tronco: 0.282 },
            { lHip: -0.179, rHip: -0.245, lKnee: 0.464, rKnee: 0.439, lFoot: -0.210, rFoot: -0.144, lArm: 0.071, rArm: 0.226, cotovelo: -0.474, tronco: 0.285 },
            { lHip: -0.122, rHip: -0.177, lKnee: 0.333, rKnee: 0.291, lFoot: -0.097, rFoot: -0.033, lArm: 0.079, rArm: 0.211, cotovelo: -0.513, tronco: 0.289 },
            { lHip: -0.083, rHip: -0.122, lKnee: 0.229, rKnee: 0.167, lFoot: 0.028, rFoot: 0.083, lArm: 0.074, rArm: 0.196, cotovelo: -0.567, tronco: 0.293 },
            { lHip: -0.077, rHip: -0.117, lKnee: 0.193, rKnee: 0.152, lFoot: 0.102, rFoot: 0.112, lArm: 0.066, rArm: 0.187, cotovelo: -0.615, tronco: 0.301 },
            { lHip: -0.108, rHip: -0.173, lKnee: 0.230, rKnee: 0.264, lFoot: 0.109, rFoot: 0.083, lArm: 0.066, rArm: 0.182, cotovelo: -0.641, tronco: 0.310 },
            { lHip: -0.163, rHip: -0.245, lKnee: 0.320, rKnee: 0.413, lFoot: 0.098, rFoot: 0.051, lArm: 0.062, rArm: 0.180, cotovelo: -0.643, tronco: 0.316 },
            { lHip: -0.184, rHip: -0.299, lKnee: 0.364, rKnee: 0.539, lFoot: 0.040, rFoot: 0.024, lArm: 0.054, rArm: 0.178, cotovelo: -0.630, tronco: 0.319 },
            { lHip: -0.175, rHip: -0.315, lKnee: 0.371, rKnee: 0.590, lFoot: -0.086, rFoot: -0.031, lArm: 0.050, rArm: 0.179, cotovelo: -0.589, tronco: 0.318 },
            { lHip: -0.202, rHip: -0.305, lKnee: 0.430, rKnee: 0.588, lFoot: -0.162, rFoot: -0.109, lArm: 0.045, rArm: 0.188, cotovelo: -0.529, tronco: 0.314 },
            { lHip: -0.239, rHip: -0.296, lKnee: 0.488, rKnee: 0.575, lFoot: -0.154, rFoot: -0.152, lArm: 0.040, rArm: 0.192, cotovelo: -0.457, tronco: 0.312 },
            { lHip: -0.214, rHip: -0.270, lKnee: 0.428, rKnee: 0.524, lFoot: -0.112, rFoot: -0.110, lArm: 0.043, rArm: 0.191, cotovelo: -0.404, tronco: 0.304 },
            { lHip: -0.165, rHip: -0.218, lKnee: 0.316, rKnee: 0.418, lFoot: -0.023, rFoot: -0.020, lArm: 0.049, rArm: 0.185, cotovelo: -0.364, tronco: 0.299 },
            { lHip: -0.123, rHip: -0.162, lKnee: 0.215, rKnee: 0.297, lFoot: 0.089, rFoot: 0.089, lArm: 0.050, rArm: 0.175, cotovelo: -0.347, tronco: 0.294 },
            { lHip: -0.121, rHip: -0.123, lKnee: 0.202, rKnee: 0.220, lFoot: 0.131, rFoot: 0.155, lArm: 0.050, rArm: 0.164, cotovelo: -0.362, tronco: 0.300 },
            { lHip: -0.161, rHip: -0.121, lKnee: 0.283, rKnee: 0.220, lFoot: 0.105, rFoot: 0.150, lArm: 0.052, rArm: 0.157, cotovelo: -0.397, tronco: 0.302 },
            { lHip: -0.213, rHip: -0.161, lKnee: 0.401, rKnee: 0.309, lFoot: 0.082, rFoot: 0.117, lArm: 0.063, rArm: 0.149, cotovelo: -0.426, tronco: 0.308 },
            { lHip: -0.251, rHip: -0.194, lKnee: 0.492, rKnee: 0.382, lFoot: 0.062, rFoot: 0.100, lArm: 0.065, rArm: 0.148, cotovelo: -0.435, tronco: 0.311 },
            { lHip: -0.274, rHip: -0.183, lKnee: 0.554, rKnee: 0.393, lFoot: -0.023, rFoot: -0.004, lArm: 0.071, rArm: 0.161, cotovelo: -0.425, tronco: 0.311 },
            { lHip: -0.278, rHip: -0.186, lKnee: 0.579, rKnee: 0.431, lFoot: -0.117, rFoot: -0.124, lArm: 0.067, rArm: 0.176, cotovelo: -0.415, tronco: 0.311 },
            { lHip: -0.298, rHip: -0.196, lKnee: 0.628, rKnee: 0.469, lFoot: -0.168, rFoot: -0.183, lArm: 0.062, rArm: 0.187, cotovelo: -0.416, tronco: 0.316 },
            { lHip: -0.316, rHip: -0.197, lKnee: 0.660, rKnee: 0.479, lFoot: -0.124, rFoot: -0.180, lArm: 0.063, rArm: 0.166, cotovelo: -0.438, tronco: 0.324 },
            { lHip: -0.332, rHip: -0.169, lKnee: 0.681, rKnee: 0.425, lFoot: -0.035, rFoot: -0.143, lArm: 0.064, rArm: 0.129, cotovelo: -0.467, tronco: 0.332 },
            { lHip: -0.333, rHip: -0.135, lKnee: 0.668, rKnee: 0.351, lFoot: 0.039, rFoot: -0.075, lArm: 0.061, rArm: 0.112, cotovelo: -0.485, tronco: 0.337 },
            { lHip: -0.305, rHip: -0.119, lKnee: 0.607, rKnee: 0.298, lFoot: 0.019, rFoot: 0.001, lArm: 0.059, rArm: 0.106, cotovelo: -0.489, tronco: 0.343 },
            { lHip: -0.277, rHip: -0.126, lKnee: 0.537, rKnee: 0.287, lFoot: 0.000, rFoot: 0.032, lArm: 0.046, rArm: 0.102, cotovelo: -0.493, tronco: 0.347 },
            { lHip: -0.259, rHip: -0.191, lKnee: 0.467, rKnee: 0.387, lFoot: 0.048, rFoot: 0.001, lArm: 0.034, rArm: 0.092, cotovelo: -0.497, tronco: 0.350 },
            { lHip: -0.254, rHip: -0.270, lKnee: 0.438, rKnee: 0.515, lFoot: 0.064, rFoot: -0.048, lArm: 0.046, rArm: 0.082, cotovelo: -0.500, tronco: 0.348 },
            { lHip: -0.243, rHip: -0.311, lKnee: 0.435, rKnee: 0.576, lFoot: -0.048, rFoot: -0.099, lArm: 0.066, rArm: 0.080, cotovelo: -0.503, tronco: 0.346 },
            { lHip: -0.241, rHip: -0.332, lKnee: 0.452, rKnee: 0.604, lFoot: -0.143, rFoot: -0.177, lArm: 0.063, rArm: 0.096, cotovelo: -0.514, tronco: 0.335 },
            { lHip: -0.258, rHip: -0.325, lKnee: 0.492, rKnee: 0.595, lFoot: -0.166, rFoot: -0.189, lArm: 0.066, rArm: 0.116, cotovelo: -0.525, tronco: 0.329 },
        ]
    },
        {
        // andar — passada de marcha (36 frames)
        nome: 'walk_1_1',
        descidaExtra: 0,    // quanto o corpo baixa, alem da `descida` do GaitModel
        ancaGanho: 1.0,      // multiplica a abertura da coxa (1.0 = a do original)
        bracoGanho: 0.4,     // braco / anca deste andamento no GaitModel
        ancaMedia: -0.1521,    // desvio de postura do clip, retirado antes de derivar o braco
        vel: 1.8,
        passada: 2.09,          // metros por ciclo, medidos no root do clip
        fps: 30,
        frames: [
            { lHip: -0.055, rHip: -0.383, lKnee: 0.153, rKnee: 0.959, lFoot: -0.081, rFoot: 0.187, lArm: 0.337, rArm: 0.092, cotovelo: -0.407, tronco: 0.086 },
            { lHip: 0.031, rHip: -0.414, lKnee: 0.079, rKnee: 0.851, lFoot: -0.071, rFoot: 0.140, lArm: 0.337, rArm: 0.077, cotovelo: -0.455, tronco: 0.085 },
            { lHip: 0.096, rHip: -0.436, lKnee: 0.035, rKnee: 0.714, lFoot: -0.076, rFoot: 0.104, lArm: 0.349, rArm: 0.052, cotovelo: -0.502, tronco: 0.083 },
            { lHip: 0.151, rHip: -0.441, lKnee: 0.014, rKnee: 0.546, lFoot: -0.090, rFoot: 0.078, lArm: 0.360, rArm: 0.027, cotovelo: -0.550, tronco: 0.088 },
            { lHip: 0.202, rHip: -0.428, lKnee: -0.007, rKnee: 0.345, lFoot: -0.105, rFoot: 0.062, lArm: 0.361, rArm: -0.003, cotovelo: -0.598, tronco: 0.093 },
            { lHip: 0.201, rHip: -0.391, lKnee: 0.070, rKnee: 0.103, lFoot: -0.107, rFoot: 0.058, lArm: 0.348, rArm: -0.042, cotovelo: -0.645, tronco: 0.104 },
            { lHip: 0.202, rHip: -0.395, lKnee: 0.137, rKnee: 0.044, lFoot: -0.084, rFoot: 0.107, lArm: 0.321, rArm: -0.074, cotovelo: -0.683, tronco: 0.114 },
            { lHip: 0.204, rHip: -0.399, lKnee: 0.206, rKnee: 0.021, lFoot: -0.046, rFoot: 0.122, lArm: 0.306, rArm: -0.103, cotovelo: -0.711, tronco: 0.124 },
            { lHip: 0.217, rHip: -0.402, lKnee: 0.253, rKnee: 0.023, lFoot: 0.005, rFoot: 0.118, lArm: 0.293, rArm: -0.118, cotovelo: -0.732, tronco: 0.128 },
            { lHip: 0.229, rHip: -0.399, lKnee: 0.300, rKnee: 0.039, lFoot: 0.096, rFoot: 0.116, lArm: 0.282, rArm: -0.122, cotovelo: -0.742, tronco: 0.130 },
            { lHip: 0.240, rHip: -0.392, lKnee: 0.339, rKnee: 0.055, lFoot: 0.223, rFoot: 0.138, lArm: 0.278, rArm: -0.117, cotovelo: -0.738, tronco: 0.128 },
            { lHip: 0.194, rHip: -0.404, lKnee: 0.474, rKnee: 0.146, lFoot: 0.330, rFoot: 0.172, lArm: 0.282, rArm: -0.094, cotovelo: -0.716, tronco: 0.125 },
            { lHip: 0.124, rHip: -0.419, lKnee: 0.622, rKnee: 0.255, lFoot: 0.391, rFoot: 0.112, lArm: 0.291, rArm: -0.096, cotovelo: -0.677, tronco: 0.128 },
            { lHip: 0.014, rHip: -0.411, lKnee: 0.798, rKnee: 0.334, lFoot: 0.478, rFoot: 0.037, lArm: 0.313, rArm: -0.083, cotovelo: -0.626, tronco: 0.133 },
            { lHip: -0.089, rHip: -0.376, lKnee: 0.940, rKnee: 0.370, lFoot: 0.462, rFoot: -0.025, lArm: 0.345, rArm: -0.047, cotovelo: -0.561, tronco: 0.134 },
            { lHip: -0.186, rHip: -0.321, lKnee: 1.039, rKnee: 0.369, lFoot: 0.378, rFoot: -0.066, lArm: 0.381, rArm: 0.008, cotovelo: -0.484, tronco: 0.128 },
            { lHip: -0.265, rHip: -0.249, lKnee: 1.072, rKnee: 0.341, lFoot: 0.318, rFoot: -0.092, lArm: 0.414, rArm: 0.061, cotovelo: -0.415, tronco: 0.119 },
            { lHip: -0.328, rHip: -0.165, lKnee: 1.055, rKnee: 0.287, lFoot: 0.253, rFoot: -0.102, lArm: 0.436, rArm: 0.088, cotovelo: -0.348, tronco: 0.111 },
            { lHip: -0.385, rHip: -0.089, lKnee: 1.002, rKnee: 0.234, lFoot: 0.189, rFoot: -0.103, lArm: 0.446, rArm: 0.120, cotovelo: -0.291, tronco: 0.101 },
            { lHip: -0.429, rHip: -0.018, lKnee: 0.912, rKnee: 0.189, lFoot: 0.132, rFoot: -0.105, lArm: 0.448, rArm: 0.159, cotovelo: -0.242, tronco: 0.095 },
            { lHip: -0.456, rHip: 0.049, lKnee: 0.783, rKnee: 0.145, lFoot: 0.084, rFoot: -0.107, lArm: 0.446, rArm: 0.198, cotovelo: -0.202, tronco: 0.096 },
            { lHip: -0.463, rHip: 0.112, lKnee: 0.619, rKnee: 0.112, lFoot: 0.045, rFoot: -0.114, lArm: 0.434, rArm: 0.224, cotovelo: -0.173, tronco: 0.100 },
            { lHip: -0.443, rHip: 0.173, lKnee: 0.397, rKnee: 0.080, lFoot: 0.031, rFoot: -0.118, lArm: 0.423, rArm: 0.251, cotovelo: -0.143, tronco: 0.107 },
            { lHip: -0.397, rHip: 0.236, lKnee: 0.137, rKnee: 0.042, lFoot: 0.036, rFoot: -0.122, lArm: 0.411, rArm: 0.255, cotovelo: -0.125, tronco: 0.114 },
            { lHip: -0.411, rHip: 0.288, lKnee: 0.027, rKnee: 0.025, lFoot: 0.019, rFoot: -0.108, lArm: 0.399, rArm: 0.247, cotovelo: -0.107, tronco: 0.120 },
            { lHip: -0.443, rHip: 0.335, lKnee: 0.005, rKnee: 0.023, lFoot: 0.060, rFoot: -0.077, lArm: 0.383, rArm: 0.236, cotovelo: -0.098, tronco: 0.123 },
            { lHip: -0.460, rHip: 0.358, lKnee: 0.037, rKnee: 0.053, lFoot: 0.077, rFoot: -0.026, lArm: 0.380, rArm: 0.222, cotovelo: -0.090, tronco: 0.128 },
            { lHip: -0.448, rHip: 0.353, lKnee: 0.045, rKnee: 0.133, lFoot: 0.142, rFoot: 0.058, lArm: 0.396, rArm: 0.202, cotovelo: -0.093, tronco: 0.127 },
            { lHip: -0.462, rHip: 0.320, lKnee: 0.159, rKnee: 0.248, lFoot: 0.127, rFoot: 0.176, lArm: 0.418, rArm: 0.177, cotovelo: -0.097, tronco: 0.123 },
            { lHip: -0.443, rHip: 0.266, lKnee: 0.202, rKnee: 0.390, lFoot: 0.165, rFoot: 0.291, lArm: 0.423, rArm: 0.150, cotovelo: -0.108, tronco: 0.120 },
            { lHip: -0.425, rHip: 0.165, lKnee: 0.265, rKnee: 0.584, lFoot: 0.095, rFoot: 0.402, lArm: 0.408, rArm: 0.128, cotovelo: -0.130, tronco: 0.119 },
            { lHip: -0.398, rHip: 0.048, lKnee: 0.311, rKnee: 0.778, lFoot: 0.031, rFoot: 0.452, lArm: 0.393, rArm: 0.112, cotovelo: -0.161, tronco: 0.116 },
            { lHip: -0.354, rHip: -0.059, lKnee: 0.326, rKnee: 0.917, lFoot: -0.017, rFoot: 0.383, lArm: 0.372, rArm: 0.113, cotovelo: -0.201, tronco: 0.109 },
            { lHip: -0.295, rHip: -0.163, lKnee: 0.318, rKnee: 1.009, lFoot: -0.051, rFoot: 0.334, lArm: 0.351, rArm: 0.115, cotovelo: -0.252, tronco: 0.106 },
            { lHip: -0.226, rHip: -0.267, lKnee: 0.286, rKnee: 1.049, lFoot: -0.073, rFoot: 0.299, lArm: 0.333, rArm: 0.115, cotovelo: -0.304, tronco: 0.098 },
            { lHip: -0.147, rHip: -0.328, lKnee: 0.239, rKnee: 1.026, lFoot: -0.088, rFoot: 0.248, lArm: 0.330, rArm: 0.104, cotovelo: -0.356, tronco: 0.095 },
        ]
    },
        {
        // trote — corrida moderada (21 frames)
        nome: 'run_3_3',
        descidaExtra: -0.036,    // quanto o corpo baixa, alem da `descida` do GaitModel
        ancaGanho: 1.0,      // multiplica a abertura da coxa (1.0 = a do original)
        bracoGanho: 0.776,     // braco / anca deste andamento no GaitModel
        ancaMedia: -0.1621,    // desvio de postura do clip, retirado antes de derivar o braco
        vel: 4.5,
        passada: 3.54,          // metros por ciclo, medidos no root do clip
        fps: 30,
        frames: [
            { lHip: -0.332, rHip: -0.095, lKnee: 0.834, rKnee: 1.760, lFoot: -0.451, rFoot: 0.370, lArm: 0.388, rArm: 0.518, cotovelo: -1.279, tronco: 0.386 },
            { lHip: -0.128, rHip: -0.361, lKnee: 0.749, rKnee: 1.840, lFoot: -0.523, rFoot: 0.244, lArm: 0.326, rArm: 0.532, cotovelo: -1.443, tronco: 0.378 },
            { lHip: 0.092, rHip: -0.562, lKnee: 0.574, rKnee: 1.756, lFoot: -0.416, rFoot: 0.130, lArm: 0.268, rArm: 0.591, cotovelo: -1.564, tronco: 0.362 },
            { lHip: 0.324, rHip: -0.680, lKnee: 0.313, rKnee: 1.542, lFoot: -0.083, rFoot: 0.046, lArm: 0.234, rArm: 0.673, cotovelo: -1.464, tronco: 0.342 },
            { lHip: 0.499, rHip: -0.701, lKnee: 0.120, rKnee: 1.204, lFoot: 0.314, rFoot: 0.009, lArm: 0.282, rArm: 0.696, cotovelo: -1.373, tronco: 0.325 },
            { lHip: 0.609, rHip: -0.662, lKnee: 0.078, rKnee: 0.802, lFoot: 0.465, rFoot: -0.011, lArm: 0.400, rArm: 0.674, cotovelo: -1.341, tronco: 0.317 },
            { lHip: 0.469, rHip: -0.594, lKnee: 0.525, rKnee: 0.430, lFoot: 0.523, rFoot: 0.057, lArm: 0.529, rArm: 0.599, cotovelo: -1.393, tronco: 0.315 },
            { lHip: 0.408, rHip: -0.511, lKnee: 0.872, rKnee: 0.251, lFoot: 0.561, rFoot: 0.050, lArm: 0.614, rArm: 0.498, cotovelo: -1.530, tronco: 0.313 },
            { lHip: 0.326, rHip: -0.499, lKnee: 1.202, rKnee: 0.349, lFoot: 0.573, rFoot: 0.000, lArm: 0.648, rArm: 0.407, cotovelo: -1.401, tronco: 0.327 },
            { lHip: 0.223, rHip: -0.500, lKnee: 1.414, rKnee: 0.624, lFoot: 0.691, rFoot: -0.097, lArm: 0.697, rArm: 0.290, cotovelo: -1.119, tronco: 0.349 },
            { lHip: 0.015, rHip: -0.430, lKnee: 1.626, rKnee: 0.805, lFoot: 0.640, rFoot: -0.290, lArm: 0.735, rArm: 0.174, cotovelo: -0.844, tronco: 0.368 },
            { lHip: -0.285, rHip: -0.272, lKnee: 1.769, rKnee: 0.825, lFoot: 0.531, rFoot: -0.436, lArm: 0.792, rArm: 0.102, cotovelo: -0.816, tronco: 0.385 },
            { lHip: -0.509, rHip: -0.076, lKnee: 1.736, rKnee: 0.729, lFoot: 0.335, rFoot: -0.396, lArm: 0.907, rArm: 0.093, cotovelo: -0.971, tronco: 0.376 },
            { lHip: -0.638, rHip: 0.161, lKnee: 1.519, rKnee: 0.504, lFoot: 0.226, rFoot: -0.191, lArm: 0.953, rArm: 0.130, cotovelo: -1.078, tronco: 0.355 },
            { lHip: -0.669, rHip: 0.436, lKnee: 1.193, rKnee: 0.143, lFoot: 0.137, rFoot: 0.190, lArm: 0.952, rArm: 0.236, cotovelo: -1.131, tronco: 0.332 },
            { lHip: -0.638, rHip: 0.491, lKnee: 0.802, rKnee: 0.160, lFoot: 0.028, rFoot: 0.516, lArm: 0.925, rArm: 0.378, cotovelo: -1.183, tronco: 0.323 },
            { lHip: -0.569, rHip: 0.340, lKnee: 0.388, rKnee: 0.653, lFoot: -0.006, rFoot: 0.659, lArm: 0.880, rArm: 0.485, cotovelo: -1.215, tronco: 0.323 },
            { lHip: -0.503, rHip: 0.259, lKnee: 0.161, rKnee: 1.066, lFoot: 0.014, rFoot: 0.674, lArm: 0.805, rArm: 0.543, cotovelo: -1.200, tronco: 0.324 },
            { lHip: -0.517, rHip: 0.192, lKnee: 0.290, rKnee: 1.414, lFoot: 0.005, rFoot: 0.532, lArm: 0.713, rArm: 0.570, cotovelo: -1.147, tronco: 0.336 },
            { lHip: -0.548, rHip: 0.106, lKnee: 0.614, rKnee: 1.638, lFoot: -0.095, rFoot: 0.569, lArm: 0.601, rArm: 0.584, cotovelo: -1.177, tronco: 0.358 },
            { lHip: -0.480, rHip: -0.001, lKnee: 0.803, rKnee: 1.740, lFoot: -0.323, rFoot: 0.529, lArm: 0.476, rArm: 0.557, cotovelo: -1.285, tronco: 0.371 },
        ]
    },
        {
        // correr — corrida a fundo (17 frames)
        nome: 'run_4_4_relax',
        descidaExtra: 0.042,    // quanto o corpo baixa, alem da `descida` do GaitModel
        ancaGanho: 1.136,      // multiplica a abertura da coxa (1.0 = a do original)
        bracoGanho: 1.031,     // braco / anca deste andamento no GaitModel
        ancaMedia: -0.1508,    // desvio de postura do clip, retirado antes de derivar o braco
        vel: 8.0,
        passada: 4.77,          // metros por ciclo, medidos no root do clip
        fps: 30,
        frames: [
            { lHip: -0.264, rHip: -0.483, lKnee: 0.839, rKnee: 2.089, lFoot: -0.470, rFoot: 0.242, lArm: 0.177, rArm: 0.616, cotovelo: -1.292, tronco: 0.367 },
            { lHip: 0.105, rHip: -0.702, lKnee: 0.639, rKnee: 1.893, lFoot: -0.348, rFoot: 0.123, lArm: 0.093, rArm: 0.717, cotovelo: -1.550, tronco: 0.307 },
            { lHip: 0.490, rHip: -0.791, lKnee: 0.219, rKnee: 1.540, lFoot: 0.193, rFoot: -0.048, lArm: 0.117, rArm: 0.682, cotovelo: -1.275, tronco: 0.235 },
            { lHip: 0.747, rHip: -0.778, lKnee: 0.080, rKnee: 0.995, lFoot: 0.445, rFoot: -0.127, lArm: 0.244, rArm: 0.616, cotovelo: -1.093, tronco: 0.217 },
            { lHip: 0.734, rHip: -0.650, lKnee: 0.452, rKnee: 0.395, lFoot: 0.501, rFoot: -0.081, lArm: 0.274, rArm: 0.597, cotovelo: -1.191, tronco: 0.238 },
            { lHip: 0.600, rHip: -0.601, lKnee: 0.999, rKnee: 0.153, lFoot: 0.508, rFoot: -0.090, lArm: 0.200, rArm: 0.543, cotovelo: -1.450, tronco: 0.319 },
            { lHip: 0.393, rHip: -0.581, lKnee: 1.502, rKnee: 0.270, lFoot: 0.477, rFoot: -0.035, lArm: 0.170, rArm: 0.526, cotovelo: -1.230, tronco: 0.353 },
            { lHip: 0.073, rHip: -0.591, lKnee: 1.938, rKnee: 0.659, lFoot: 0.472, rFoot: -0.064, lArm: 0.259, rArm: 0.498, cotovelo: -0.708, tronco: 0.393 },
            { lHip: -0.324, rHip: -0.406, lKnee: 2.158, rKnee: 0.811, lFoot: 0.443, rFoot: -0.346, lArm: 0.425, rArm: 0.412, cotovelo: -0.502, tronco: 0.421 },
            { lHip: -0.613, rHip: -0.078, lKnee: 2.057, rKnee: 0.705, lFoot: 0.327, rFoot: -0.453, lArm: 0.557, rArm: 0.317, cotovelo: -0.559, tronco: 0.365 },
            { lHip: -0.738, rHip: 0.314, lKnee: 1.753, rKnee: 0.365, lFoot: 0.196, rFoot: -0.123, lArm: 0.624, rArm: 0.273, cotovelo: -0.684, tronco: 0.269 },
            { lHip: -0.772, rHip: 0.627, lKnee: 1.300, rKnee: 0.057, lFoot: 0.126, rFoot: 0.481, lArm: 0.639, rArm: 0.235, cotovelo: -0.754, tronco: 0.224 },
            { lHip: -0.712, rHip: 0.723, lKnee: 0.777, rKnee: 0.297, lFoot: 0.001, rFoot: 0.397, lArm: 0.666, rArm: 0.309, cotovelo: -0.831, tronco: 0.223 },
            { lHip: -0.631, rHip: 0.704, lKnee: 0.339, rKnee: 0.653, lFoot: -0.085, rFoot: 0.594, lArm: 0.660, rArm: 0.369, cotovelo: -0.863, tronco: 0.235 },
            { lHip: -0.623, rHip: 0.556, lKnee: 0.288, rKnee: 1.176, lFoot: -0.111, rFoot: 0.561, lArm: 0.603, rArm: 0.369, cotovelo: -0.940, tronco: 0.273 },
            { lHip: -0.589, rHip: 0.307, lKnee: 0.549, rKnee: 1.669, lFoot: -0.072, rFoot: 0.532, lArm: 0.556, rArm: 0.397, cotovelo: -1.027, tronco: 0.288 },
            { lHip: -0.506, rHip: -0.070, lKnee: 0.809, rKnee: 2.058, lFoot: -0.319, rFoot: 0.496, lArm: 0.368, rArm: 0.548, cotovelo: -1.181, tronco: 0.320 },
        ]
    },
    ]
};
