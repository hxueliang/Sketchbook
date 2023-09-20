import * as THREE from 'three';
import gsap from 'gsap';
import Swal from 'sweetalert2';

import { LoadingManager } from '../core/LoadingManager';
import {World} from '../world/World'
import { IUpdatable } from '../interfaces/IUpdatable';

export class LuckyTrigger extends THREE.Object3D implements IUpdatable
{
  public updateOrder: number;
  public world: World;
  public isInner: boolean;

  constructor(gltf: THREE.Object3D, world: World) {
    super();
    this.name = 'LuckyTrigger';
    this.updateOrder = 0;
    this.world = world;
    this.isInner = false;

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
    // 添加到注册表
    world.registerUpdatable(this);

    gsap.to(texture.offset, {
      x: 1.33, // glb模型高度
      duration: 1,
      repeat: -1,
      yoyo: true,
    })
  }

  update(timestep: number, unscaledTimeStep: number): void {
    // console.log(timestep, unscaledTimeStep);
    // 判断距离
    // 判断距离可以工程里的ClosestObjectFinder类
    const character = this.world.characters[0];
    if(character) {
      const length = character.position.distanceTo(this.position);
      if(length < 1 && !this.isInner) {
        this.isInner = true;
        this.enterHandler()
      }
    }
  }

  enterHandler() {
    Swal.fire({
      title: '恭喜您，中奖了',
      text: '您获得对象一个',
      footer: '<a href="https://github.com/swift502/Sketchbook" target="_blank">GitHub page</a><a href="https://discord.gg/fGuEqCe" target="_blank">Discord server</a>',
      confirmButtonText: 'Okay',
      buttonsStyling: false,
      onClose: () => {}
    });
  }
}