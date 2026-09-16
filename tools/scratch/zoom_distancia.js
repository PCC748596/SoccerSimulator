/*
A QUE DISTANCIA DO ALVO FICA A CAMARA, POR VISTA, NO ZOOM MAXIMO.

Pedido: *"ajusta o zoom in maximo para uma distancia de 5 metros dos
jogadores"*. Ver CameraZoom (config/tactics.js): o piso do multiplicador so
serve para os 5 m serem ALCANCAVEIS; quem manda neles e o `distanciaMinima`,
aplicado a distancia ja calculada.

E e por isso que esta ferramenta existe: cada vista parte de uma distancia
diferente, portanto o piso tem de ser conferido contra a mais AFASTADA (a
Tatica Cima, que depende do racio do ecra). Com o piso em 0.05 ela parava a
5.25 m e nao chegava ao limite.

Uso: node tools/scratch/zoom_distancia.js
*/
require('../headless/harness.js');
const scene = new THREE.Scene();
Match.init(scene);
window.cameraCore = new THREE.PerspectiveCamera(45, 1.78, 0.1, 300);
window.lastFrameDelta = 1/60;
Match.ball.position.set(0, 0.11, 0);

for (const modo of ['center', 'sideline', 'lateraltv', 'topdown']) {
    window.cameraMode = modo;
    for (const z of [1.0, CameraZoom.min]) {
        window.cameraZoom = z;
        Match.updateCamera();
        const alvo = Match._cTPos, olhar = Match._cLTar;
        const d = Math.hypot(alvo.x - olhar.x, alvo.y - olhar.y, alvo.z - olhar.z);
        console.log(modo.padEnd(10) + ' zoom ' + z.toFixed(2).padStart(5) +
            ' -> distancia ao alvo ' + d.toFixed(2) + ' m' +
            (z === CameraZoom.min ? '   (minimo pedido: ' + CameraZoom.distanciaMinima + ')' : ''));
    }
}
