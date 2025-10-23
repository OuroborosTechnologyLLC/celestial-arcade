import * as THREE from './libs/three.module.js';
import Stats from './libs/stats.module.js';

let stats, renderer, scene, camera, cube, rafId;

export const init = () => {
	stats = new Stats();
	stats.showPanel(0);
	document.body.appendChild(stats.dom);
	scene = new THREE.Scene();
	camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(innerWidth, innerHeight);
	document.body.appendChild(renderer.domElement);

	const geometry = new THREE.BoxGeometry();
	const material = new THREE.MeshNormalMaterial();
	cube = new THREE.Mesh(geometry, material);
	scene.add(cube);

	camera.position.z = 3;

	animate();
}

const animate = () => {
	stats.begin();
	rafId = requestAnimationFrame(animate);
	cube.rotation.x += 0.02;
	cube.rotation.y += 0.03;
	renderer.render(scene, camera);
	stats.end();
}

const dispose = () => {
	cancelAnimationFrame(rafId);
	renderer.domElement.remove();
	renderer.dispose();
}

