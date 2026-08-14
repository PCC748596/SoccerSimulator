function mergeNonIndexedGeometries(geos) {
    let totalVertices = 0;
    geos.forEach(g => {
        totalVertices += g.attributes.position.count;
    });

    const positions = new Float32Array(totalVertices * 3);
    const normals = new Float32Array(totalVertices * 3);

    let vertexOffset = 0;
    geos.forEach(g => {
        const count = g.attributes.position.count;
        positions.set(g.attributes.position.array, vertexOffset * 3);
        normals.set(g.attributes.normal.array, vertexOffset * 3);
        vertexOffset += count;
        g.dispose();
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    return merged;
}

function createSpectatorGeometry() {
    const u = 1.0;
    const pelvis = new THREE.BoxGeometry(u * 1.3, u * 0.6, u * 0.8).toNonIndexed(); pelvis.translate(0, 2.6, 0);
    const belly = new THREE.BoxGeometry(u * 1.1, u * 0.45, u * 0.7).toNonIndexed(); belly.translate(0, 3.125, 0);
    const chest = new THREE.BoxGeometry(u * 1.4, u * 1.0, u * 0.75).toNonIndexed(); chest.translate(0, 3.85, 0);
    const head = new THREE.BoxGeometry(u * 0.8, u * 1.0, u * 0.85).toNonIndexed(); head.translate(0, 4.975, 0);
    const lArm = new THREE.BoxGeometry(u * 0.45, u * 1.1, u * 0.45).toNonIndexed(); lArm.translate(u * 0.9, 3.65, 0);
    const rArm = new THREE.BoxGeometry(u * 0.45, u * 1.1, u * 0.45).toNonIndexed(); rArm.translate(-u * 0.9, 3.65, 0);
    const legs = new THREE.BoxGeometry(u * 1.3, u * 0.5, u * 1.6).toNonIndexed(); legs.translate(0, 2.1, 0.4);
    const merged = mergeNonIndexedGeometries([pelvis, belly, chest, head, lArm, rArm, legs]);
    merged.scale(1.8 / 5.5, 1.8 / 5.5, 1.8 / 5.5);
    merged.translate(0, -0.65, 0);
    return merged;
}

/*
Mistura os três andamentos conforme a velocidade.

Devolve um objecto com a mesma forma que uma entrada do GaitModel, com os
valores interpolados. Abaixo do `andar` e acima do `correr` não extrapola — o
andamento fica no extremo.
*/
function misturarAndamento(vel) {
    const A = GaitModel.andar, T = GaitModel.trote, C = GaitModel.correr;
    let a, b, k;

    if (vel <= A.vel) { a = A; b = A; k = 0; }
    else if (vel <= T.vel) { a = A; b = T; k = (vel - A.vel) / (T.vel - A.vel); }
    else if (vel <= C.vel) { a = T; b = C; k = (vel - T.vel) / (C.vel - T.vel); }
    else { a = C; b = C; k = 0; }

    const r = {};
    for (const campo in A) r[campo] = lerp(a[campo], b[campo], k);
    return r;
}

/*
Pose de locomoção para um dado ponto do ciclo `t` (0..1) e uma velocidade.

Ao contrário do getRunPose (que ficou para o guarda-redes, que tem andamento
próprio), aqui a AMPLITUDE também depende da velocidade — é isso que faz andar
parecer andar e não correr devagar.

O joelho só dobra na fase de balanço (`max(0, sin)`): a perna de apoio fica
quase direita, que é o que distingue uma passada de uma corrida.
*/
function getGaitPose(t, vel) {
    const g = misturarAndamento(vel);
    const c = t * Math.PI * 2;

    return {
        lHip: Math.sin(c) * g.anca,
        rHip: Math.sin(c + Math.PI) * g.anca,
        lKnee: g.joelhoBase + Math.max(0, Math.sin(c - Math.PI / 2)) * g.joelhoOscila,
        rKnee: g.joelhoBase + Math.max(0, Math.sin(c + Math.PI / 2)) * g.joelhoOscila,
        lFoot: -Math.sin(c) * g.pe,
        rFoot: -Math.sin(c + Math.PI) * g.pe,
        lArm: Math.sin(c + Math.PI) * g.braco,
        rArm: Math.sin(c) * g.braco,
        cotovelo: g.cotovelo,
        tronco: g.tronco,
        // Dois ressaltos por ciclo, um por cada apoio. O termo constante
        // mantém a anca ligeiramente acima do zero, como no código anterior —
        // sem ele os pés afundam no relvado no ponto mais baixo do ciclo.
        ressalto: g.ressalto * (1.0 + Math.sin(c * 2 + Math.PI)) * 0.5,
        passada: g.passada
    };
}

function getRunPose(t) {
    const cycle = t * Math.PI * 2;
    return {
        lHip: Math.sin(cycle) * 1.1,
        rHip: Math.sin(cycle + Math.PI) * 1.1,
        lKnee: Math.max(0, Math.sin(cycle - Math.PI / 2) * 1.5),
        rKnee: Math.max(0, Math.sin(cycle + Math.PI / 2) * 1.5),
        lFoot: 0,
        rFoot: 0,
        lArm: Math.sin(cycle + Math.PI) * 1.0,
        rArm: Math.sin(cycle) * 1.0
    };
}


/*
Sorteio com taxa POR SEGUNDO em vez de por frame.

As decisões aleatórias estavam escritas como `Math.random() < 0.15`, avaliado
uma vez por frame. Isso torna a IA dependente do FPS (a 144 Hz tenta desarmar
2,4x mais vezes por segundo do que a 60 Hz) e faz o botão de velocidade 1.6x
alterar a agressividade das equipas. Multiplicar pelo dt do frame corrige as
duas coisas — e a 60 fps dá exactamente o comportamento antigo.

    taxa = tentativas por segundo
*/
/*
Duelo de skills opostos (Técnica x Marcação, Velocidade x Força, Passe x
Interceptação, Técnica x GK): devolve true se A vence. baseA é a chance de A
com os dois skills EMPATADOS (0.5 = justo, <0.5 favorece B por natureza da
jogada — ex.: um carrinho é arriscado por si só). escala controla quanto a
diferença de skill pesa: com skills 50-100, uma diferença de 50 pontos muda
a chance em ~50/escala.
*/
function venceuDuelo(valorA, valorB, baseA = 0.5, escala = 220) {
    const chance = THREE.MathUtils.clamp(baseA + (valorA - valorB) / escala, 0.08, 0.92);
    return Math.random() < chance;
}

function chancePorSegundo(taxa, dt) {
    return Math.random() < taxa * dt;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpTo(atual, alvo = 0, v = 0.15) { const r = atual + (alvo - atual) * v; return Math.abs(r - alvo) < 0.001 ? alvo : r; }

/*
Wrapper para model.lookAt(ponto) nos jogadores.

Histórico: cheguei a meter aqui um `rotation.y += Math.PI`, deduzido a partir
da posição da cara (+Z) em buildBody — matematicamente consistente sozinho,
mas testado em jogo deu jogadores/guarda-redes de costas onde antes (com
`.lookAt()` puro) não geravam essa queixa. Ou seja: a dedução geométrica
estava errada nalgum ponto (ou o pressuposto sobre a ordem dos materiais da
BoxGeometry, ou outra coisa) e o `.lookAt()` sem flip é que está certo.
Revertido — fica só como wrapper para o dia em que isto for investigado a
sério (comparar de facto contra o jogo, não só contra a matemática).
*/
function lookAtBola(model, point) {
    model.lookAt(point);
}

/*
Alvo posicional de um colega para efeitos de passe/lançamento: o alvo que
o PositionBT (nível 2) já calculou para ele — para onde o bloco o está a
mandar — e não a posição actual.

Simplificação deliberada e temporária: até existir o PlayingStylesBT, é
mais previsível mirar para onde a equipa QUER que o colega esteja do que
tentar antecipar a posição actual dele com lead por velocidade. O guarda-
redes nunca tem tacticalTarget (não passa pelo PositionBT), por isso cai
na posição actual.
*/
function alvoDePasse(p) {
    const alvo = p.tacticalTarget;
    if (!alvo) return p.model.position;

    /*
    Sem tecto, um alvo do PositionBT muito à frente da posição REAL do
    colega (típico de pontas/avançados a meio de uma desmarcação longa, ou
    agora também dos biases temporários — GK_CATCH_BALL/CB_HAS_BALL) fazia
    o passador mirar um "fantasma" lá à frente enquanto o colega ainda
    estava fisicamente atrás — parecia um passe para trás sem sentido.
    Central quase não sofre (o slot dele mal se afasta da posição actual);
    ponta/avançado em transição longa, sim. Tecto de 10m: além disso, mistura
    com a posição real em vez de mirar só o alvo.
    */
    const real = p.model.position;
    const dist = alvo.distanceTo(real);
    const maxLead = 10.0;
    if (dist <= maxLead) return alvo;
    return real.clone().lerp(alvo, maxLead / dist);
}

function applyKeyframeAnimation(player, animName, time) {
    const anim = OptimizedAnimations[animName];
    if (!anim) return;
    const bones = anim.bones;
    const rig = player.rig;
    
    for (const boneName in bones) {
        const keyframes = bones[boneName];
        if (!keyframes || keyframes.length === 0) continue;
        
        let fA = keyframes[0], fB = keyframes[0];
        for (let i = 0; i < keyframes.length - 1; i++) {
            if (time >= keyframes[i].t && time <= keyframes[i + 1].t) {
                fA = keyframes[i];
                fB = keyframes[i + 1];
                break;
            }
        }
        
        let tLocal = 0;
        if (fB.t !== fA.t) {
            tLocal = (time - fA.t) / (fB.t - fA.t);
        }
        
        const rA = fA.r;
        const rB = fB.r;
        
        let targetBone = rig[boneName];
        if (targetBone) {
            targetBone.rotation.x = rA[0] + (rB[0] - rA[0]) * tLocal;
            targetBone.rotation.y = rA[1] + (rB[1] - rA[1]) * tLocal;
            targetBone.rotation.z = rA[2] + (rB[2] - rA[2]) * tLocal;
            
            if (boneName === 'pelvis' && fA.p && fB.p) {
                const pA = fA.p;
                const pB = fB.p;
                const baseHipsHeight = keyframes[0].p[1] * 0.01;
                const currentHipsHeight = (pA[1] + (pB[1] - pA[1]) * tLocal) * 0.01;
                player.model.position.y = ALTURA_BASE_Y + (currentHipsHeight - baseHipsHeight);
            }
        }
    }
}

const OptimizedAnimations = {
    "Soccer Tackle": {
        "duration": 1.767,
        "bones": {
            "pelvis": [
                {"t":0,"r":[0,0,0],"p":[0,87.6,0]},
                {"t":0.5,"r":[-0.1,1.1,-0.9],"p":[-5.2,23.3,241]},
                {"t":1.0,"r":[0.3,1.0,-0.7],"p":[-18.9,27.2,347]},
                {"t":1.767,"r":[0.3,-0.05,-0.01],"p":[1.5,86.1,414]}
            ],
            "lLeg": [
                {"t":0,"r":[-0.2,0,-3.0]},
                {"t":0.8,"r":[-1.2,0.3,2.7]},
                {"t":1.767,"r":[-0.7,0,-2.8]}
            ],
            "rLeg": [
                {"t":0,"r":[-0.5,0.1,3.0]},
                {"t":0.8,"r":[-0.6,0.1,2.6]},
                {"t":1.767,"r":[-0.7,0,2.9]}
            ]
        }
    },
    "Goalie Throw": { 
        "duration": 3.833, 
        "bones": {
             "pelvis": [
                {"t":0,"r":[0,0,0],"p":[0,93,0]},
                {"t":3.833,"r":[0,0,0],"p":[0,93,0]}
            ]
        } 
    }
};

