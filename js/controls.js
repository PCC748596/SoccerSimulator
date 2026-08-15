class SimpleOrbitControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.target = new THREE.Vector3(0, 0, 0);
        this.theta = -Math.PI / 2;
        this.phi = Math.PI / 4;
        this.radius = 80;

        this.isDragging = false;
        this.previousMousePosition = { x: 0, y: 0 };

        this.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', () => this.onMouseUp());
        this.domElement.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

        this.domElement.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: true });
        this.domElement.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: true });
        window.addEventListener('touchend', () => this.onMouseUp());

        this.initialPinchDistance = 0;
        this.initialRadius = this.radius;

        this.keys = { a: false, d: false };
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'a') this.keys.a = true;
            if (e.key.toLowerCase() === 'd') this.keys.d = true;
        });
        window.addEventListener('keyup', (e) => {
            if (e.key.toLowerCase() === 'a') this.keys.a = false;
            if (e.key.toLowerCase() === 'd') this.keys.d = false;
        });

        this.updateCameraPosition();
    }

    update() {
        if (window.cameraMode === 'orbit') {
            if (this.keys.a || this.keys.d) {
                // Calcular vetor "direita" da câmera (ignorando eixo Y para manter o pan no plano do chão)
                let right = new THREE.Vector3();
                this.camera.getWorldDirection(right);
                right.y = 0;
                right.normalize();
                right.cross(new THREE.Vector3(0, 1, 0)).normalize();
                
                const speed = 1.0;
                if (this.keys.a) this.target.addScaledVector(right, -speed);
                if (this.keys.d) this.target.addScaledVector(right, speed);
            }
            this.updateCameraPosition();
        }
    }

    onMouseDown(e) {
        if (window.cameraMode !== 'orbit') return;
        this.isDragging = true;
        this.previousMousePosition = { x: e.clientX, y: e.clientY };
    }

    onMouseMove(e) {
        if (!this.isDragging || window.cameraMode !== 'orbit') return;
        const deltaX = e.clientX - this.previousMousePosition.x;
        const deltaY = e.clientY - this.previousMousePosition.y;

        // Eixos invertidos para rotação natural
        this.theta += deltaX * 0.005;
        this.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, this.phi - deltaY * 0.005));

        this.previousMousePosition = { x: e.clientX, y: e.clientY };
    }

    onMouseUp() {
        this.isDragging = false;
    }

    onWheel(e) {
        window.cameraZoom = THREE.MathUtils.clamp(window.cameraZoom + e.deltaY * 0.001, 0.24, 2.5);
        this.radius = 80 * window.cameraZoom;
        e.preventDefault();
    }

    onTouchStart(e) {
        if (window.cameraMode !== 'orbit') return;
        if (e.touches.length === 1) {
            this.isDragging = true;
            this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
            this.isDragging = false;
            this.initialPinchDistance = this.getPinchDistance(e);
            this.initialRadius = this.radius;
        }
    }

    onTouchMove(e) {
        if (e.touches.length === 1 && this.isDragging) {
            if (window.cameraMode !== 'orbit') return;
            const deltaX = e.touches[0].clientX - this.previousMousePosition.x;
            const deltaY = e.touches[0].clientY - this.previousMousePosition.y;

            // Eixos invertidos para rotação natural
            this.theta += deltaX * 0.008;
            this.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, this.phi - deltaY * 0.008));

            this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
            const currentDistance = this.getPinchDistance(e);
            if (currentDistance > 0 && this.initialPinchDistance > 0) {
                const factor = this.initialPinchDistance / currentDistance;
                window.cameraZoom = THREE.MathUtils.clamp((this.initialRadius * factor) / 80, 0.24, 2.5);
                this.radius = 80 * window.cameraZoom;
            }
        }
    }

    getPinchDistance(e) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    updateCameraPosition() {
        const x = this.radius * Math.sin(this.phi) * Math.cos(this.theta);
        const y = this.radius * Math.cos(this.phi);
        const z = this.radius * Math.sin(this.phi) * Math.sin(this.theta);

        this.camera.position.set(x, y, z).add(this.target);
        this.camera.lookAt(this.target);
    }

    syncFromCamera(camera, lookTarget) {
        if (!lookTarget) return;
        this.target.copy(lookTarget);
        
        let offset = new THREE.Vector3().subVectors(camera.position, lookTarget);
        this.radius = offset.length();
        if (this.radius < 0.1) this.radius = 0.1;
        
        this.phi = Math.acos(THREE.MathUtils.clamp(offset.y / this.radius, -1, 1));
        this.theta = Math.atan2(offset.z, offset.x);
        
        this.updateCameraPosition();
    }
}

