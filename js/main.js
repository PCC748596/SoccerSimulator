let scene, rendererCore, cameraCore, orbitControls;
let lastTime = 0;
let fpsFrames = 0;
let fpsLastTime = 0;

// Minimiza/maximiza o painel de comandos. Também ligado à tecla X
// (ver Match.setupKeyboardListeners).
function togglePainel(forcarMinimizado) {
    const painel = document.getElementById('painel-comandos');
    if (!painel) return;

    const minimizar = (forcarMinimizado === undefined)
        ? !painel.classList.contains('minimizado')
        : forcarMinimizado;

    painel.classList.toggle('minimizado', minimizar);

    const btn = document.getElementById('btn-painel');
    if (btn) btn.innerHTML = minimizar ? '&plus;' : '&minus;';
}

function togglePainelPlayerBT(forcarMinimizado) {
    const painel = document.getElementById('painel-playerbt');
    if (!painel) return;

    const minimizar = (forcarMinimizado === undefined)
        ? !painel.classList.contains('minimizado')
        : forcarMinimizado;

    painel.classList.toggle('minimizado', minimizar);

    const btn = document.getElementById('btn-painel-playerbt');
    if (btn) btn.innerHTML = minimizar ? '&plus;' : '&minus;';
}

/*
Painel PlayerBT Debug: mostra, por equipa, o caminho percorrido na árvore
do jogador mais "relevante" no momento (o portador, senão o chaser
definido pelo TeamBT) — nome do nó + resultado (SUCCESS/FAILURE), na ordem
em que o BT os avaliou. A última acção com SUCCESS é o comportamento
realmente activo agora; as condições FAILURE acima dela mostram porque os
ramos anteriores (de maior prioridade) foram rejeitados.

Lê p.btCtx.trace, preenchido pelo motor de BT (ver BT.debug em core.js) —
não duplica nada, só formata o que a árvore já regista.
*/
function jogadorRelevante(team) {
    const lista = (team === 'TeamA') ? Match.players : Match.opponents;
    const carrier = Match.ballCarrier;
    if (carrier && carrier.team === team) return carrier;
    const chaser = (team === 'TeamA') ? Match.chaserA : Match.chaserB;
    if (chaser) return chaser;
    return lista.find(p => p.role !== 'gk') || null;
}

function formatarTrace(p) {
    if (!p || !p.btCtx || !p.btCtx.trace || p.btCtx.trace.length === 0) return '(sem trace)';
    return p.btCtx.trace.map(linha => {
        const activo = linha.endsWith(':SUCCESS') && !linha.startsWith('PlayerRoot') &&
            !linha.startsWith('ComBola') && !linha.startsWith('SemBola') &&
            !linha.includes('Decisao');
        return activo ? ('-> ' + linha) : ('   ' + linha);
    }).join('\n');
}

function updatePainelPlayerBT() {
    const painel = document.getElementById('painel-playerbt');
    if (!painel || painel.classList.contains('minimizado')) return;
    if (typeof Match === 'undefined' || !Match.players || !Match.players.length) return;

    const pA = jogadorRelevante('TeamA');
    const pB = jogadorRelevante('TeamB');

    const tituloA = document.getElementById('btdebug-titulo-a');
    const tituloB = document.getElementById('btdebug-titulo-b');
    if (tituloA) tituloA.textContent = pA ? `TeamA — #${pA.num} ${pA.pos}` : 'TeamA —';
    if (tituloB) tituloB.textContent = pB ? `TeamB — #${pB.num} ${pB.pos}` : 'TeamB —';

    const traceA = document.getElementById('btdebug-trace-a');
    const traceB = document.getElementById('btdebug-trace-b');
    if (traceA) traceA.textContent = formatarTrace(pA);
    if (traceB) traceB.textContent = formatarTrace(pB);
}

function togglePainelDireito(forcarMinimizado) {
    const painel = document.getElementById('painel-direito');
    if (!painel) return;

    const minimizar = (forcarMinimizado === undefined)
        ? !painel.classList.contains('minimizado')
        : forcarMinimizado;

    painel.classList.toggle('minimizado', minimizar);

    const btn = document.getElementById('btn-painel-direito');
    if (btn) btn.innerHTML = minimizar ? '&plus;' : '&minus;';
}

function toggleOffside() {
    Match.showOffsideLines = !Match.showOffsideLines;
    Match.offsideLineA.visible = Match.showOffsideLines;
    Match.offsideLineB.visible = Match.showOffsideLines;
    document.getElementById('btn-offside').innerText = 'OffSide: ' + (Match.showOffsideLines ? 'ON' : 'OFF');
    document.getElementById('btn-offside').classList.toggle('active', Match.showOffsideLines);
}

// Stubs for future features (PlayerNumber, PlayerBT)
function togglePlayerNumber() {
    window.showPlayerNumber = !window.showPlayerNumber;
    document.getElementById('btn-playernumber').innerText = 'PlayerNumber: ' + (window.showPlayerNumber ? 'ON' : 'OFF');
    document.getElementById('btn-playernumber').classList.toggle('active', window.showPlayerNumber);
}

function togglePlayerBT() {
    window.showPlayerBT = !window.showPlayerBT;
    document.getElementById('btn-playerbt').innerText = 'PlayerBT: ' + (window.showPlayerBT ? 'ON' : 'OFF');
    document.getElementById('btn-playerbt').classList.toggle('active', window.showPlayerBT);
}

function togglePlayerPOS() {
    window.showPlayerPOS = !window.showPlayerPOS;
    document.getElementById('btn-playerpos').innerText = 'PlayerPOS: ' + (window.showPlayerPOS ? 'ON' : 'OFF');
    document.getElementById('btn-playerpos').classList.toggle('active', window.showPlayerPOS);
}

window.teamBTPosState = 'OFF';
function toggleTeamBTPos() {
    if (window.teamBTPosState === 'OFF') window.teamBTPosState = 'TeamA';
    else if (window.teamBTPosState === 'TeamA') window.teamBTPosState = 'TeamB';
    else if (window.teamBTPosState === 'TeamB') window.teamBTPosState = 'Both';
    else window.teamBTPosState = 'OFF';

    let uiLabel = window.teamBTPosState;
    if (uiLabel === 'TeamA') uiLabel = 'TeamBlue';
    else if (uiLabel === 'TeamB') uiLabel = 'TeamRed';
    else if (uiLabel === 'Both') uiLabel = 'Both';

    document.getElementById('btn-teambtpos').innerText = 'Team BT POS: ' + uiLabel;
    document.getElementById('btn-teambtpos').classList.toggle('active', window.teamBTPosState !== 'OFF');
    if (typeof Match !== 'undefined' && Match.passTargetVisual) {
        Match.passTargetVisual.visible = (window.teamBTPosState !== 'OFF' || window.positionBTToggleState !== 'OFF');
    }
}

window.positionBTToggleState = 'OFF';
function togglePositionBT() {
    if (window.positionBTToggleState === 'OFF') window.positionBTToggleState = 'TeamA';
    else if (window.positionBTToggleState === 'TeamA') window.positionBTToggleState = 'TeamB';
    else if (window.positionBTToggleState === 'TeamB') window.positionBTToggleState = 'Both';
    else window.positionBTToggleState = 'OFF';

    let uiLabel = window.positionBTToggleState;
    if (uiLabel === 'TeamA') uiLabel = 'TeamBlue';
    else if (uiLabel === 'TeamB') uiLabel = 'TeamRed';
    else if (uiLabel === 'Both') uiLabel = 'Both';

    document.getElementById('btn-positionbt').innerText = 'Position BT: ' + uiLabel;
    document.getElementById('btn-positionbt').classList.toggle('active', window.positionBTToggleState !== 'OFF');
    if (typeof Match !== 'undefined' && Match.passTargetVisual) {
        Match.passTargetVisual.visible = (window.teamBTPosState !== 'OFF' || window.positionBTToggleState !== 'OFF');
    }
}

function toggleSpatialGrid() {
    if (typeof SpatialGrid === 'undefined') return;
    SpatialGrid.setDebug(!SpatialGrid.debug);
    document.getElementById('btn-spatialgrid').innerText = 'Spatial Grid: ' + (SpatialGrid.debug ? 'ON' : 'OFF');
    document.getElementById('btn-spatialgrid').classList.toggle('active', SpatialGrid.debug);
}

// Dispara a simulação em lote a partir do botão do painel — parâmetros
// modestos por omissão para não prender a página por muito tempo; para
// lotes maiores, usar Sim.run({...}) directamente na consola.
function runFastSim() {
    if (typeof Sim === 'undefined') return;
    if (Sim.running) { console.warn('Sim já está a correr.'); return; }

    const btn = document.getElementById('btn-fastsim');
    if (btn) { btn.innerText = 'A simular...'; btn.disabled = true; }

    Sim.run({ jogos: 10, duracaoSeg: 120 }).then(() => {
        if (btn) { btn.innerText = 'Simulação rápida (10×2min)'; btn.disabled = false; }
    });
}

function animate(time) {
    requestAnimationFrame(animate);

    // A simulação em lote (js/simulate.js) conduz o Match.update() e não
    // desenha nada — enquanto ela corre, este loop fica de fora por
    // completo, para não haver dois donos do tick nem gasto de GPU à toa.
    if (typeof Sim !== 'undefined' && Sim.running) return;

    let delta = (time - lastTime) / 1000;
    if (isNaN(delta) || delta > 0.1) delta = 0.016;
    lastTime = time;

    fpsFrames++;
    if (time - fpsLastTime >= 1000) {
        let fps = Math.round((fpsFrames * 1000) / (time - fpsLastTime));
        let titleEl = document.getElementById('app-title');
        if (titleEl) titleEl.innerText = 'SOCCER SIM | FPS: ' + fps;
        fpsFrames = 0;
        fpsLastTime = time;
    }

    if (!window.isPaused) {
        Match.update(delta * window.speedMultiplier);
    }

    if (TeamAI && TeamAI.blackboards) {
        const bbA = TeamAI.blackboards['TeamA'];
        if (bbA && bbA.posture) document.getElementById('hud-state-a').innerText = bbA.posture;

        const bbB = TeamAI.blackboards['TeamB'];
        if (bbB && bbB.posture) document.getElementById('hud-state-b').innerText = bbB.posture;
    }

    // Throttlado (~5Hz) — é texto de debug, não precisa de 60 escritas de DOM/s.
    if (!window._btDebugLastUpdate || time - window._btDebugLastUpdate > 200) {
        window._btDebugLastUpdate = time;
        updatePainelPlayerBT();
    }

    if (window.cameraMode === 'orbit') {
        if (orbitControls) orbitControls.update();
    } else {
        Match.updateCamera();
    }

    rendererCore.render(scene, cameraCore);
}

document.addEventListener("DOMContentLoaded", () => {
    try {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB);

        cameraCore = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
        window.cameraCore = cameraCore;

        rendererCore = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        rendererCore.setSize(window.innerWidth, window.innerHeight);
        rendererCore.shadowMap.enabled = true;
        rendererCore.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(rendererCore.domElement);
        window.rendererCore = rendererCore;

        orbitControls = new SimpleOrbitControls(cameraCore, rendererCore.domElement);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 100, 40);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        
        const d = 80;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.camera.near = 10;
        dirLight.shadow.camera.far = 250;
        dirLight.shadow.bias = -0.0005; 

        scene.add(dirLight);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
        scene.add(ambientLight);

        Match.init(scene);
        Tatics.updateSkills();
        requestAnimationFrame(animate);
    } catch (err) {
        console.error("Erro crítico de inicialização:", err);
        const hud = document.getElementById('hud-state');
        if (hud) {
            hud.innerText = "Erro: " + err.message;
            hud.style.color = "#ff4757";
        }
    }
});

window.addEventListener('resize', () => {
    if (window.cameraCore && window.rendererCore) {
        window.cameraCore.aspect = window.innerWidth / window.innerHeight;
        window.cameraCore.updateProjectionMatrix();
        window.rendererCore.setSize(window.innerWidth, window.innerHeight);
    }
});
