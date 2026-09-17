/*
=============================================================================
STAFF — os funcionários do estádio, de colete laranja
=============================================================================
O anel de pessoal de serviço à volta do recinto: uma fila a 1 m da primeira
fila da bancada, e pequenos grupos atrás das placas de publicidade. As medidas
e as cores vivem no `FuncionariosEstadio` (config/physics.js); aqui está só a
construção.

O MODELO É O DOS ADEPTOS, e é reaproveitado inteiro: `Crowd._geometriasDaPose`
já funde o boneco dos jogadores numa geometria por canal de cor (pele, camisa,
calção, cabelo) para uma pose dada. Um funcionário é um adepto com o canal da
camisa pintado de laranja e posto no relvado em vez de num degrau.

    Por isso não há rig, nem animação, nem update por frame. São
    InstancedMesh estáticos — duas poses × quatro canais, oito draw calls para
    o pessoal todo — e o `build` corre uma vez, dentro do `createField`.

AS POSES SÃO AS DO PÚBLICO, pela mesma razão: `dePe` para quem está de serviço
à frente da bancada, `sentado` para quem espera atrás das placas, com um banco
baixo por baixo (a pose sentada tem as pernas dobradas de quem está num
assento, e sem o banco ficava de cócoras no ar).

O QUE ESTE FICHEIRO NÃO FAZ, e é deliberado: não lê o `Match`, não reage ao
jogo e não se mexe. O público já tem tudo isso (ver crowd.js, com o movimento
todo no vertex shader); aqui são oitenta e tantos bonecos de cenário, e
qualquer coisa por frame para eles é trabalho a pagar sem nada para ver.
=============================================================================
*/

const Staff = {
    _grupo: null,

    /*
    Gerador determinista. O estádio tem de sair igual em duas execuções
    seguidas — senão uma captura de ecrã nunca reproduz a anterior, e a
    variação de pele/altura passava a piscar entre recargas.
    */
    _semear(s) {
        let semente = s | 0;
        return () => {
            semente = (semente * 1103515245 + 12345) & 0x7fffffff;
            return semente / 0x7fffffff;
        };
    },

    /*
    OS PONTOS DO ANEL, com as esquinas arredondadas da bancada.

    Percorre-se o perímetro por comprimento de arco e põe-se um funcionário a
    cada `passo` metros. Fazer as rectas por `for (z += passo)` e as curvas por
    ângulo dava dois espaçamentos diferentes — apertado nas curvas, porque um
    passo em ângulo não é um passo em metros.

    `X`/`Z` são os limites das rectas, `R` o raio das curvas e (`cx`, `cz`) os
    centros delas — os mesmos centros da bancada e das placas, portanto os três
    anéis ficam concêntricos.
    */
    _pontosDoAnel(X, Z, R, cx, cz, passo) {
        /*
        Os oito segmentos, pela ordem em que fecham o anel: recta, curva,
        recta, curva... Cada um sabe dar um ponto a partir do comprimento `s`
        já andado dentro dele.
        */
        const segmentos = [];
        const recta = (x0, z0, x1, z1) => {
            const L = Math.hypot(x1 - x0, z1 - z0);
            segmentos.push({
                L,
                em: (s) => {
                    const t = s / L;
                    return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t };
                }
            });
        };
        const curva = (ccx, ccz, a0) => {
            const L = R * Math.PI / 2;
            segmentos.push({
                L,
                em: (s) => {
                    const a = a0 + (s / R);
                    return { x: ccx + R * Math.cos(a), z: ccz + R * Math.sin(a) };
                }
            });
        };

        // Começa no meio da lateral Este (+X) e roda no sentido dos z
        // crescentes; o ângulo de cada curva sai do quadrante dela.
        recta(X, 0, X, cz);
        curva(cx, cz, 0);                    // (+X, +Z)
        recta(cx, Z, -cx, Z);
        curva(-cx, cz, Math.PI / 2);         // (-X, +Z)
        recta(-X, cz, -X, -cz);
        curva(-cx, -cz, Math.PI);            // (-X, -Z)
        recta(-cx, -Z, cx, -Z);
        curva(cx, -cz, 3 * Math.PI / 2);     // (+X, -Z)
        recta(X, -cz, X, 0);

        const total = segmentos.reduce((a, s) => a + s.L, 0);
        /*
        O PASSO AJUSTA-SE PARA O ANEL FECHAR. Com o passo exacto o último
        intervalo é o resto da divisão — dois funcionários a 1 m um do outro no
        ponto onde a volta se fecha. Reparte-se a sobra por todos: com 5 m
        pedidos e 424 m de perímetro, o passo real fica a centímetros disso.
        */
        const n = Math.max(1, Math.round(total / passo));
        const passoReal = total / n;

        const saida = [];
        let iSeg = 0, base = 0;
        for (let i = 0; i < n; i++) {
            const s = i * passoReal;
            while (iSeg < segmentos.length - 1 && s > base + segmentos[iSeg].L) {
                base += segmentos[iSeg].L;
                iSeg++;
            }
            const p = segmentos[iSeg].em(Math.min(s - base, segmentos[iSeg].L));
            saida.push(p);
        }
        return saida;
    },

    /*
    OS GRUPOS ATRÁS DAS PLACAS. Cada lado leva `porLado` grupos, espalhados ao
    longo dele e nunca em cima da linha de meio-campo nem do eixo das balizas —
    os centros saem de uma divisão que deixa margem nas pontas, senão um grupo
    caía dentro da curva da esquina, onde a placa já virou e eles ficariam de
    lado para o campo.
    */
    _pontosDosGrupos(placaX, placaZ, cantoX, cantoZ, G, rnd) {
        const saida = [];

        const linha = (eixo, sinal, fixo, limite, quantos) => {
            if (quantos <= 0) return;
            for (let g = 1; g <= quantos; g++) {
                // Centros em `limite * (2g - quantos - 1) / (quantos + 1)`:
                // simétricos em relação ao meio e com folga nas pontas.
                const centro = limite * (2 * g - quantos - 1) / (quantos + 1);
                for (let i = 0; i < G.pessoasPorGrupo; i++) {
                    const d = centro + (i - (G.pessoasPorGrupo - 1) / 2) * G.passoNoGrupo;
                    if (Math.abs(d) > limite) continue;
                    // Um passo de recuo por pessoa: um grupo é um bolo, não uma
                    // fila de três.
                    const recuo = (fixo > 0 ? 1 : -1) * (rnd() * 0.5);
                    if (eixo === 'x') saida.push({ x: fixo + recuo, z: d });
                    else saida.push({ x: d, z: fixo + recuo });
                }
            }
        };

        const rx = placaX + G.recuoDaPlaca;
        const rz = placaZ + G.recuoDaPlaca;
        linha('x', 1, rx, cantoZ, G.porLadoLateral);
        linha('x', -1, -rx, cantoZ, G.porLadoLateral);
        linha('z', 1, rz, cantoX, G.porLadoFundo);
        linha('z', -1, -rz, cantoX, G.porLadoFundo);
        return saida;
    },

    /*
    Geometrias por canal para uma pose, com os PÉS NO ZERO.

    A pose do público está medida para um degrau (ver `alturaBacia` no
    CrowdModel) e por isso não assenta no y = 0 sozinha: a de pé fica uns
    centímetros acima, a sentada bem mais. Mede-se a caixa envolvente do canal
    mais baixo e desce-se o conjunto todo pelo mesmo valor — pelo MESMO, e não
    canal a canal, senão a cabeça descia até ao chão junto com os pés.
    */
    _geometrias(pose) {
        const geos = Crowd._geometriasDaPose(pose);
        let minY = Infinity;
        for (const canal in geos) {
            geos[canal].computeBoundingBox();
            minY = Math.min(minY, geos[canal].boundingBox.min.y);
        }
        if (isFinite(minY)) {
            for (const canal in geos) {
                geos[canal].translate(0, -minY, 0);
                geos[canal].computeBoundingSphere();
            }
        }
        return geos;
    },

    /*
    A cor de um canal, com a variação por pessoa — e `tipo` é quem ele é:

        'anel'      funcionário do estádio: colete LARANJA e calças todas
                    iguais. É um fardamento, e o que se lê nele é ser igual em
                    toda a gente.
        'imprensa'  fotógrafo ou reporter atrás das placas: colete AMARELO por
                    cima da roupa dele. Por isso as calças saem do baralho
                    `roupasImprensa` — eles não são do estádio, são gente à
                    civil com um colete emprestado.

    O COLETE NÃO LEVA A VARIAÇÃO DE TOM que a roupa leva, nos dois casos: a
    razão de um alta-visibilidade existir é ser exactamente a mesma cor em
    todos, e variá-lo ±10% desfazia isso.
    */
    _corDe(canal, F, rnd, tipo) {
        const c = new THREE.Color();
        const imprensa = (tipo === 'imprensa');
        if (canal === 'camisa') {
            return c.set(imprensa ? F.cores.coleteImprensa : F.cores.colete);
        }
        if (canal === 'calcao') {
            const baralho = F.cores.roupasImprensa;
            c.set((imprensa && baralho && baralho.length)
                ? baralho[Math.floor(rnd() * baralho.length)]
                : F.cores.calcas);
        } else if (canal === 'pele') {
            c.set(CrowdModel.peles[Math.floor(rnd() * CrowdModel.peles.length)]);
        } else {
            c.set(CrowdModel.cabelos[Math.floor(rnd() * CrowdModel.cabelos.length)]);
        }
        const k = 1 + (rnd() - 0.5) * 2 * F.variacaoCor;
        return c.multiplyScalar(k);
    },

    /*
    UM MATERIAL POR CANAL, e as duas cores de colete cabem no mesmo: a cor
    difusa vem da instância (`setColorAt`), portanto laranja e amarelo
    convivem na mesma malha. O que é do MATERIAL e não da instância é a cor
    EMISSIVA — e é por isso que ela é um âmbar escuro em vez do tom de um dos
    dois coletes (ver `emissiveColete` no config).
    */
    _material(canal, F) {
        if (canal === 'camisa') {
            return new THREE.MeshStandardMaterial({
                color: 0xffffff, roughness: 0.55,
                emissive: new THREE.Color(F.cores.emissiveColete),
                emissiveIntensity: 0.45
            });
        }
        return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    },

    /*
    Constrói o pessoal todo dentro de `grupo`.

    `geo` são as medidas que o `createField` já tem em mão:
        bancadaX / bancadaZ        primeira fila da bancada
        cantoX / cantoZ            centros das curvas das esquinas
        raioPrimeiraFila           raio dessas curvas
        placaX / placaZ            os painéis de publicidade

    Devolve o número de funcionários postos, ou 0 se estiver desligado (é o que
    os testes leem).
    */
    build(grupo, geo) {
        const F = (typeof FuncionariosEstadio !== 'undefined') ? FuncionariosEstadio : null;
        if (!F || !F.activo || !grupo || !geo) return 0;
        if (typeof Crowd === 'undefined' || typeof CrowdModel === 'undefined') return 0;

        const rnd = this._semear(20260917);

        /*
        DE PÉ no anel da bancada, e atrás das placas metade sentada. `lugares`
        junta os dois conjuntos porque daqui para baixo só interessa a pose.
        */
        const lugares = { dePe: [], sentado: [] };

        const anel = this._pontosDoAnel(
            geo.bancadaX - F.recuoDaBancada,
            geo.bancadaZ - F.recuoDaBancada,
            Math.max(0.5, geo.raioPrimeiraFila - F.recuoDaBancada),
            geo.cantoX, geo.cantoZ, F.espacamento);
        for (const p of anel) lugares.dePe.push({ x: p.x, z: p.z, tipo: 'anel' });

        if (F.grupos && F.grupos.activo) {
            const pts = this._pontosDosGrupos(
                geo.placaX, geo.placaZ, geo.cantoX, geo.cantoZ, F.grupos, rnd);
            for (const p of pts) {
                const sentado = rnd() < F.grupos.fraccaoSentados;
                /*
                O `tipo` viaja com o ponto porque as duas poses misturam os
                dois grupos de gente: um fotógrafo de pé vai para a MESMA
                InstancedMesh que um funcionário do anel, e é a cor por
                instância que os separa. Sem a etiqueta, ao juntar as listas
                perdia-se quem era quem.
                */
                lugares[sentado ? 'sentado' : 'dePe'].push(
                    { x: p.x, z: p.z, tipo: 'imprensa' });
            }
        }

        const dummy = new THREE.Object3D();
        const bancos = [];

        for (const nomePose of ['dePe', 'sentado']) {
            const pontos = lugares[nomePose];
            if (!pontos.length) continue;

            const geos = this._geometrias(CrowdModel.poses[nomePose]);
            const canais = Object.keys(geos);
            /*
            A ALTURA DO ASSENTO SAI DA POSE, medida no calção: na pose
            `sentado` os pés estão no zero e a anca a 0.61 m, e é aí que o
            banco tem de acabar. Escrita à mão no config, a caixa saía-lhe
            pela cintura ou deixava-o a flutuar — e mudar `ESCALA_CORPO`
            desalinhava-a sem ninguém dar por isso.
            */
            let alturaAssento = 0;
            if (geos.calcao) {
                geos.calcao.computeBoundingBox();
                alturaAssento = geos.calcao.boundingBox.max.y;
            }
            const malhas = {};
            for (const canal of canais) {
                const im = new THREE.InstancedMesh(
                    geos[canal], this._material(canal, F), pontos.length);
                im.castShadow = true;
                // Ver a nota do `mergedStepsMesh` (createField): a caixa da
                // sombra não chega à bancada, e receber sombra aqui era apanhar
                // o texel da borda do mapa.
                im.receiveShadow = false;
                /*
                SEM FRUSTUM CULLING, pela mesma razão do público (crowd.js): a
                caixa envolvente de uma InstancedMesh é a da GEOMETRIA, medida
                num boneco na origem, e as instâncias estão espalhadas por 400
                m de perímetro. Com culling, o anel inteiro desaparecia sempre
                que a origem saísse do enquadramento.
                */
                im.frustumCulled = false;
                im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
                malhas[canal] = im;
                grupo.add(im);
            }

            pontos.forEach((p, i) => {
                // Virado para o centro do campo: o boneco olha para +Z com
                // rotY = 0 (a mesma convenção das cadeiras, ver
                // addSeatInstance), portanto a direcção até à origem é
                // atan2(-x, -z).
                const rotY = Math.atan2(-p.x, -p.z) +
                    (rnd() - 0.5) * 2 * F.variacaoRotacao;
                const escala = F.escalaMin + rnd() * (F.escalaMax - F.escalaMin);

                /*
                OS PÉS FICAM NO RELVADO nas duas poses — a sentada tem-nos no
                chão e a anca levantada, que é o que um banco por baixo
                completa. Levantar o boneco pela altura do banco era pô-lo a
                pairar com as pernas no ar.
                */
                if (nomePose === 'sentado') {
                    bancos.push({ x: p.x, z: p.z, rotY, altura: alturaAssento * escala });
                }

                dummy.position.set(p.x, 0, p.z);
                dummy.rotation.set(0, rotY, 0);
                dummy.scale.set(escala, escala, escala);
                dummy.updateMatrix();

                for (const canal of canais) {
                    malhas[canal].setMatrixAt(i, dummy.matrix);
                    malhas[canal].setColorAt(i, this._corDe(canal, F, rnd, p.tipo));
                }
            });

            for (const canal of canais) {
                malhas[canal].instanceMatrix.needsUpdate = true;
                if (malhas[canal].instanceColor) malhas[canal].instanceColor.needsUpdate = true;
            }
        }

        // OS BANCOS, numa InstancedMesh só. Caixa baixa e escura: a esta
        // distância um banco a sério não se distingue de uma caixa, e custava
        // mais geometria pelo mesmo pixel.
        if (bancos.length) {
            const B = F.grupos.banco;
            /*
            A caixa tem 1 m de altura e é a escala em Y de cada instância que
            lhe dá a altura do assento daquela pessoa — assim um funcionário
            mais alto não fica sentado no ar.
            */
            const im = new THREE.InstancedMesh(
                new THREE.BoxGeometry(B.largura, 1, B.profundidade),
                new THREE.MeshStandardMaterial({ color: B.cor, roughness: 0.9 }),
                bancos.length);
            im.castShadow = true;
            im.receiveShadow = false;
            im.frustumCulled = false;   // ver a nota acima
            bancos.forEach((b, i) => {
                dummy.position.set(b.x, b.altura / 2, b.z);
                dummy.rotation.set(0, b.rotY, 0);
                dummy.scale.set(1, b.altura, 1);
                dummy.updateMatrix();
                im.setMatrixAt(i, dummy.matrix);
            });
            im.instanceMatrix.needsUpdate = true;
            grupo.add(im);
        }

        this._grupo = grupo;
        return lugares.dePe.length + lugares.sentado.length;
    }
};

if (typeof window !== 'undefined') window.Staff = Staff;
