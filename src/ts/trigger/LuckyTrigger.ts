import * as THREE from 'three';
import { LoadingManager } from '../core/LoadingManager';
import {World} from '../world/World'
import gsap from 'gsap';

export class LuckyTrigger extends THREE.Object3D
{
  constructor(gltf: THREE.Object3D, world: World) {
    super();
    this.name = 'LuckyTrigger';

    const object = gltf;
    let worldPos = new THREE.Vector3();
    object.position.add(object.parent.position);
    object.getWorldPosition(worldPos);
    this.position.set(worldPos.x, worldPos.y, worldPos.z);

    const loadingManager = new LoadingManager(world)
    const texture = (new THREE.TextureLoader).load('build/assets/imgs/trigger1.png');
    texture.rotation = -Math.PI / 2;
    loadingManager.loadGLTF('build/assets/trigger.glb', gltf => {
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        alphaMap: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      gltf.scene.children[0].material = material;
      this.add(gltf.scene);
		});

    world.graphicsWorld.add(this);

    gsap.to(texture.offset, {
      x: 1.33, // glb模型高度
      duration: 1,
      repeat: -1,
      yoyo: true,
    })
  }
}