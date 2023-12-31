import * as THREE from 'three';
import * as CANNON from 'cannon';
import * as _ from 'lodash';
import * as Utils from '../core/FunctionLibrary';

import { KeyBinding } from '../core/KeyBinding';
import { VectorSpringSimulator } from '../physics/spring_simulation/VectorSpringSimulator';
import { RelativeSpringSimulator } from '../physics/spring_simulation/RelativeSpringSimulator';
import { Idle } from './character_states/Idle';
import { EnteringVehicle } from './character_states/vehicles/EnteringVehicle';
import { ExitingVehicle } from './character_states/vehicles/ExitingVehicle';
import { OpenVehicleDoor as OpenVehicleDoor } from './character_states/vehicles/OpenVehicleDoor';
import { Driving } from './character_states/vehicles/Driving';
import { ExitingAirplane } from './character_states/vehicles/ExitingAirplane';
import { ICharacterAI } from '../interfaces/ICharacterAI';
import { World } from '../world/World';
import { IControllable } from '../interfaces/IControllable';
import { ICharacterState } from '../interfaces/ICharacterState';
import { IWorldEntity } from '../interfaces/IWorldEntity';
import { VehicleSeat } from '../vehicles/VehicleSeat';
import { Vehicle } from '../vehicles/Vehicle';
import { CollisionGroups } from '../enums/CollisionGroups';
import { CapsuleCollider } from '../physics/colliders/CapsuleCollider';
import { VehicleEntryInstance } from './VehicleEntryInstance';
import { SeatType } from '../enums/SeatType';
import { GroundImpactData } from './GroundImpactData';
import { ClosestObjectFinder } from '../core/ClosestObjectFinder';
import { Object3D } from 'three';
import { EntityType } from '../enums/EntityType';

export class Character extends THREE.Object3D implements IWorldEntity
{
	public updateOrder: number = 1;
	public entityType: EntityType = EntityType.Character;

	public height: number = 0;
	public tiltContainer: THREE.Group;
	public modelContainer: THREE.Group;
	public materials: THREE.Material[] = [];
	public mixer: THREE.AnimationMixer;
	public animations: any[];

	// Movement
	public acceleration: THREE.Vector3 = new THREE.Vector3();
	public velocity: THREE.Vector3 = new THREE.Vector3();
	public arcadeVelocityInfluence: THREE.Vector3 = new THREE.Vector3();
	public velocityTarget: THREE.Vector3 = new THREE.Vector3();
	public arcadeVelocityIsAdditive: boolean = false;

	public defaultVelocitySimulatorDamping: number = 0.8;
	public defaultVelocitySimulatorMass: number = 50;
	public velocitySimulator: VectorSpringSimulator;
	public moveSpeed: number = 4;
	public angularVelocity: number = 0;
	public orientation: THREE.Vector3 = new THREE.Vector3(0, 0, 1);
	public orientationTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 1);
	public defaultRotationSimulatorDamping: number = 0.5;
	public defaultRotationSimulatorMass: number = 10;
	public rotationSimulator: RelativeSpringSimulator;
	public viewVector: THREE.Vector3;
	public actions: { [action: string]: KeyBinding };
	public characterCapsule: CapsuleCollider;
	
	// Ray casting
	public rayResult: CANNON.RaycastResult = new CANNON.RaycastResult();
	public rayHasHit: boolean = false;
	public rayCastLength: number = 0.57;
	public raySafeOffset: number = 0.03;
	public wantsToJump: boolean = false;
	public initJumpSpeed: number = -1;
	public groundImpactData: GroundImpactData = new GroundImpactData();
	public raycastBox: THREE.Mesh;
	
	public world: World;
	public charState: ICharacterState;
	public behaviour: ICharacterAI;
	
	// Vehicles
	public controlledObject: IControllable;
	public occupyingSeat: VehicleSeat = null;
	public vehicleEntryInstance: VehicleEntryInstance = null;

	public targetPosition: THREE.Vector3 = new THREE.Vector3();
	public targetDirection: THREE.Vector3 = new THREE.Vector3();
	
	private physicsEnabled: boolean = true;

	constructor(gltf: any)
	{
		super();

		// 读取角色模型数据
		this.readCharacterData(gltf);
		// 根据模型动画数据设置动画
		this.setAnimations(gltf.animations);

		// The visuals group is centered for easy character tilting
		// 创建一个组方便管理和控制角色
		this.tiltContainer = new THREE.Group();
		// 因为this继承了THREE.Object3D，所以可以直接add
		this.add(this.tiltContainer);

		// Model container is used to reliably ground the character, as animation can alter the position of the model itself
		// 再嵌套一层模型容器，更好的控制动画和角色的行为
		this.modelContainer = new THREE.Group();
		// 结合模型数据，调整y值
		this.modelContainer.position.y = -0.57;
		// tiltContainer 嵌套 modelContainer 嵌套 gltf.scene
		this.tiltContainer.add(this.modelContainer);
		this.modelContainer.add(gltf.scene);

		// 创建动画混合器
		this.mixer = new THREE.AnimationMixer(gltf.scene);

		// 速度模拟器
		this.velocitySimulator = new VectorSpringSimulator(60, this.defaultVelocitySimulatorMass, this.defaultVelocitySimulatorDamping);
		// 旋转模拟器
		this.rotationSimulator = new RelativeSpringSimulator(60, this.defaultRotationSimulatorMass, this.defaultRotationSimulatorDamping);

		// 视图向量
		this.viewVector = new THREE.Vector3();

		// Actions
		// 根据按键定义动作动画
		this.actions = {
			'up': new KeyBinding('KeyW'),
			'down': new KeyBinding('KeyS'),
			'left': new KeyBinding('KeyA'),
			'right': new KeyBinding('KeyD'),
			'run': new KeyBinding('ShiftLeft'),
			'jump': new KeyBinding('Space'),
			'use': new KeyBinding('KeyE'),
			'enter': new KeyBinding('KeyF'),
			'enter_passenger': new KeyBinding('KeyG'),
			'seat_switch': new KeyBinding('KeyX'),
			'primary': new KeyBinding('Mouse0'),
			'secondary': new KeyBinding('Mouse1'),
		};

		// Physics
		// Player Capsule
		// 创建物理碰撞的角色胶囊
		this.characterCapsule = new CapsuleCollider({
			mass: 1,
			position: new CANNON.Vec3(),
			height: 0.5,
			radius: 0.25,
			segments: 8,
			friction: 0.0
		});
		// capsulePhysics.physical.collisionFilterMask = ~CollisionGroups.Trimesh;
		// 设置能够碰撞的碰撞组
		this.characterCapsule.body.shapes.forEach((shape) => {
			// tslint:disable-next-line: no-bitwise
			/**
			 * 设置掩码
			 * CollisionGroups.TrimeshColliders为4，即100
			 * ~按位取反，得到011，即shape.collisionFilterMask为011
			 */
			shape.collisionFilterMask = ~CollisionGroups.TrimeshColliders;
		});
		// 允许休眠
		this.characterCapsule.body.allowSleep = false;

		// Move character to different collision group for raycasting
		// 设置碰撞组
		this.characterCapsule.body.collisionFilterGroup = 2;

		// Disable character rotation
		// 禁用角色旋转
		this.characterCapsule.body.fixedRotation = true;
		// 禁用完成要设置更新
		this.characterCapsule.body.updateMassProperties();

		// Ray cast debug
		const boxGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
		const boxMat = new THREE.MeshLambertMaterial({
			color: 0xff0000
		});
		// 胶囊体下部的红色拿，方便调试
		this.raycastBox = new THREE.Mesh(boxGeo, boxMat);
		this.raycastBox.visible = false;

		// Physics pre/post step callback bindings
		// 更新前要做那些预处理
		this.characterCapsule.body.preStep = (body: CANNON.Body) => { this.physicsPreStep(body, this); };
		// 更新后要做那些处理
		this.characterCapsule.body.postStep = (body: CANNON.Body) => { this.physicsPostStep(body, this); };

		// States
		// 更新角色状态为待机状态
		this.setState(new Idle(this));
	}

	public setAnimations(animations: []): void
	{
		this.animations = animations;
	}

	public setArcadeVelocityInfluence(x: number, y: number = x, z: number = x): void
	{
		this.arcadeVelocityInfluence.set(x, y, z);
	}

	public setViewVector(vector: THREE.Vector3): void
	{
		this.viewVector.copy(vector).normalize();
	}

	/**
	 * Set state to the player. Pass state class (function) name.
	 * @param {function} State 
	 */
	/**
	 * 设置状态
	 * @param state 
	 */
	public setState(state: ICharacterState): void
	{
		// 初始化角色状态
		this.charState = state;
		this.charState.onInputChange();
	}

	public setPosition(x: number, y: number, z: number): void
	{
		if (this.physicsEnabled)
		{
			this.characterCapsule.body.previousPosition = new CANNON.Vec3(x, y, z);
			this.characterCapsule.body.position = new CANNON.Vec3(x, y, z);
			this.characterCapsule.body.interpolatedPosition = new CANNON.Vec3(x, y, z);
		}
		else
		{
			this.position.x = x;
			this.position.y = y;
			this.position.z = z;
		}
	}

	public resetVelocity(): void
	{
		this.velocity.x = 0;
		this.velocity.y = 0;
		this.velocity.z = 0;

		this.characterCapsule.body.velocity.x = 0;
		this.characterCapsule.body.velocity.y = 0;
		this.characterCapsule.body.velocity.z = 0;

		this.velocitySimulator.init();
	}

	public setArcadeVelocityTarget(velZ: number, velX: number = 0, velY: number = 0): void
	{
		this.velocityTarget.z = velZ;
		this.velocityTarget.x = velX;
		this.velocityTarget.y = velY;
	}

	public setOrientation(vector: THREE.Vector3, instantly: boolean = false): void
	{
		let lookVector = new THREE.Vector3().copy(vector).setY(0).normalize();
		this.orientationTarget.copy(lookVector);
		
		if (instantly)
		{
			this.orientation.copy(lookVector);
		}
	}

	public resetOrientation(): void
	{
		const forward = Utils.getForward(this);
		this.setOrientation(forward, true);
	}

	public setBehaviour(behaviour: ICharacterAI): void
	{
		behaviour.character = this;
		this.behaviour = behaviour;
	}

	public setPhysicsEnabled(value: boolean): void {
		this.physicsEnabled = value;

		if (value === true)
		{
			this.world.physicsWorld.addBody(this.characterCapsule.body);
		}
		else
		{
			this.world.physicsWorld.remove(this.characterCapsule.body);
		}
	}

	public readCharacterData(gltf: any): void
	{
		gltf.scene.traverse((child) => {

			if (child.isMesh)
			{
				Utils.setupMeshProperties(child);

				if (child.material !== undefined)
				{
					this.materials.push(child.material);
				}
			}
		});
	}

	/**
	 * 处理键盘事件
	 * @param event 
	 * @param code 
	 * @param pressed 
	 */
	public handleKeyboardEvent(event: KeyboardEvent, code: string, pressed: boolean): void
	{
		if (this.controlledObject !== undefined)
		{
			this.controlledObject.handleKeyboardEvent(event, code, pressed);
		}
		else
		{
			// Free camera
			// 按了shift + c 切换自由相机
			if (code === 'KeyC' && pressed === true && event.shiftKey === true)
			{
				// 重置控制器
				this.resetControls();
				// 由相机操作接管
				this.world.cameraOperator.characterCaller = this;
				// 输入操作的接收者改为相机控制器
				this.world.inputManager.setInputReceiver(this.world.cameraOperator);
			}
			// 按了shift + r 重启场景
			else if (code === 'KeyR' && pressed === true && event.shiftKey === true)
			{
				this.world.restartScenario();
			}
			else
			{
				for (const action in this.actions) {
					if (this.actions.hasOwnProperty(action)) {
						const binding = this.actions[action];
	
						// 判断之前绑定的按键里，是否有当前的的按键
						if (_.includes(binding.eventCodes, code))
						{
							// 切换对应的动作行为
							this.triggerAction(action, pressed);
						}
					}
				}
			}
		}
	}

	public handleMouseButton(event: MouseEvent, code: string, pressed: boolean): void
	{
		if (this.controlledObject !== undefined)
		{
			this.controlledObject.handleMouseButton(event, code, pressed);
		}
		else
		{
			for (const action in this.actions) {
				if (this.actions.hasOwnProperty(action)) {
					const binding = this.actions[action];

					if (_.includes(binding.eventCodes, code))
					{
						this.triggerAction(action, pressed);
					}
				}
			}
		}
	}

	public handleMouseMove(event: MouseEvent, deltaX: number, deltaY: number): void
	{
		if (this.controlledObject !== undefined)
		{
			this.controlledObject.handleMouseMove(event, deltaX, deltaY);
		}
		else
		{
			this.world.cameraOperator.move(deltaX, deltaY);
		}
	}
	
	public handleMouseWheel(event: WheelEvent, value: number): void
	{
		if (this.controlledObject !== undefined)
		{
			this.controlledObject.handleMouseWheel(event, value);
		}
		else
		{
			this.world.scrollTheTimeScale(value);
		}
	}

	/**
	 * 切换动作
	 * @param actionName 
	 * @param value 
	 */
	public triggerAction(actionName: string, value: boolean): void
	{
		// Get action and set it's parameters
		// 根据名称拿到动作
		let action = this.actions[actionName];

		// 是否按下状态
		if (action.isPressed !== value)
		{
			// Set value
			action.isPressed = value;

			// Reset the 'just' attributes
			// 重置按下状态
			action.justPressed = false;
			// 重置抬起状态
			action.justReleased = false;

			// Set the 'just' attributes
			// 根据value，设置是按下还是抬起
			if (value) action.justPressed = true;
			else action.justReleased = true;

			// Tell player to handle states according to new input
			// 告诉玩家修改角色状态
			this.charState.onInputChange();

			// Reset the 'just' attributes
			// 复原
			action.justPressed = false;
			action.justReleased = false;
		}
	}

	/**
	 * 设置角色接管输入控制
	 */
	public takeControl(): void
	{
		if (this.world !== undefined)
		{
			// 设置输入的接收者为this，即当前角色
			this.world.inputManager.setInputReceiver(this);
		}
		else
		{
			console.warn('Attempting to take control of a character that doesn\'t belong to a world.');
		}
	}

	public resetControls(): void
	{
		for (const action in this.actions) {
			if (this.actions.hasOwnProperty(action)) {
				this.triggerAction(action, false);
			}
		}
	}

	/**
	 * 角色更新
	 * @param timeStep 
	 */
	public update(timeStep: number): void
	{
		// 行为更新
		this.behaviour?.update(timeStep);
		// 状态更新，是否进入交通工具
		this.vehicleEntryInstance?.update(timeStep);
		// console.log(this.occupyingSeat);
		// 角色状态更新
		this.charState?.update(timeStep);

		// this.visuals.position.copy(this.modelOffset);
		if (this.physicsEnabled) this.springMovement(timeStep);
		if (this.physicsEnabled) this.springRotation(timeStep);
		if (this.physicsEnabled) this.rotateModel();
		// 动画更新
		if (this.mixer !== undefined) this.mixer.update(timeStep);

		// Sync physics/graphics
		// 物理世界与threejs世界同步
		if (this.physicsEnabled)
		{
			this.position.set(
				this.characterCapsule.body.interpolatedPosition.x,
				this.characterCapsule.body.interpolatedPosition.y,
				this.characterCapsule.body.interpolatedPosition.z
			);
		}
		else {
			let newPos = new THREE.Vector3();
			this.getWorldPosition(newPos);

			this.characterCapsule.body.position.copy(Utils.cannonVector(newPos));
			this.characterCapsule.body.interpolatedPosition.copy(Utils.cannonVector(newPos));
		}

		// 更新世界矩阵
		this.updateMatrixWorld();
	}

	/**
	 * 输入接收者初始化
	 * @returns 
	 */
	public inputReceiverInit(): void
	{
		if (this.controlledObject !== undefined)
		{
			this.controlledObject.inputReceiverInit();
			return;
		}

		this.world.cameraOperator.setRadius(1.6, true);
		if(this.world.mobile) {
			this.world.cameraOperator.setRadius(5, true);
		}
		this.world.cameraOperator.followMode = false;
		// this.world.dirLight.target = this;

		this.displayControls();
	}

	/**
	 * 设置控制面板信息
	 */
	public displayControls(): void
	{
		this.world.updateControls([
			{
				keys: ['W', 'A', 'S', 'D'],
				desc: '移动'
			},
			{
				keys: ['Shift'],
				desc: '加速'
			},
			{
				keys: ['Space'],
				desc: '跳跃'
			},
			{
				keys: ['F', 'or', 'G'],
				desc: '进入交通工具'
			},
			{
				keys: ['Shift', '+', 'R'],
				desc: '重生'
			},
			{
				keys: ['Shift', '+', 'C'],
				desc: '自由相机'
			},
		]);
	}

	public inputReceiverUpdate(timeStep: number): void
	{
		if (this.controlledObject !== undefined)
		{
			this.controlledObject.inputReceiverUpdate(timeStep);
		}
		else
		{
			// Look in camera's direction
			this.viewVector = new THREE.Vector3().subVectors(this.position, this.world.camera.position);
			this.getWorldPosition(this.world.cameraOperator.target);
		}
		
	}

	public setAnimation(clipName: string, fadeIn: number): number
	{
		if (this.mixer !== undefined)
		{
			// gltf
			let clip = THREE.AnimationClip.findByName( this.animations, clipName );

			let action = this.mixer.clipAction(clip);
			if (action === null)
			{
				console.error(`Animation ${clipName} not found!`);
				return 0;
			}

			this.mixer.stopAllAction();
			action.fadeIn(fadeIn);
			action.play();

			return action.getClip().duration;
		}
	}

	public springMovement(timeStep: number): void
	{
		// Simulator
		this.velocitySimulator.target.copy(this.velocityTarget);
		this.velocitySimulator.simulate(timeStep);

		// Update values
		this.velocity.copy(this.velocitySimulator.position);
		this.acceleration.copy(this.velocitySimulator.velocity);
	}

	public springRotation(timeStep: number): void
	{
		// Spring rotation
		// Figure out angle between current and target orientation
		let angle = Utils.getSignedAngleBetweenVectors(this.orientation, this.orientationTarget);

		// Simulator
		this.rotationSimulator.target = angle;
		this.rotationSimulator.simulate(timeStep);
		let rot = this.rotationSimulator.position;

		// Updating values
		this.orientation.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
		this.angularVelocity = this.rotationSimulator.velocity;
	}

	public getLocalMovementDirection(): THREE.Vector3
	{
		const positiveX = this.actions.right.isPressed ? -1 : 0;
		const negativeX = this.actions.left.isPressed ? 1 : 0;
		const positiveZ = this.actions.up.isPressed ? 1 : 0;
		const negativeZ = this.actions.down.isPressed ? -1 : 0;

		return new THREE.Vector3(positiveX + negativeX, 0, positiveZ + negativeZ).normalize();
	}

	public getCameraRelativeMovementVector(): THREE.Vector3
	{
		const localDirection = this.getLocalMovementDirection();
		const flatViewVector = new THREE.Vector3(this.viewVector.x, 0, this.viewVector.z).normalize();

		return Utils.appplyVectorMatrixXZ(flatViewVector, localDirection);
	}

	public setCameraRelativeOrientationTarget(): void
	{
		if (this.vehicleEntryInstance === null)
		{
			let moveVector = this.getCameraRelativeMovementVector();
	
			if (moveVector.x === 0 && moveVector.y === 0 && moveVector.z === 0)
			{
				this.setOrientation(this.orientation);
			}
			else
			{
				this.setOrientation(moveVector);
			}
		}
	}

	public rotateModel(): void
	{
		this.lookAt(this.position.x + this.orientation.x, this.position.y + this.orientation.y, this.position.z + this.orientation.z);
		this.tiltContainer.rotation.z = (-this.angularVelocity * 2.3 * this.velocity.length());
		this.tiltContainer.position.setY((Math.cos(Math.abs(this.angularVelocity * 2.3 * this.velocity.length())) / 2) - 0.5);
	}

	public jump(initJumpSpeed: number = -1): void
	{
		this.wantsToJump = true;
		this.initJumpSpeed = initJumpSpeed;
	}

	// 发现交通工具并进入
	public findVehicleToEnter(wantsToDrive: boolean): void
	{
		// reusable world position variable
		let worldPos = new THREE.Vector3();

		// Find best vehicle
		// 寻找10以内，最近交通工具
		let vehicleFinder = new ClosestObjectFinder<Vehicle>(this.position, 10);
		// 循环判断所有的交通工具，是否是最近的
		this.world.vehicles.forEach((vehicle) =>
		{
			vehicleFinder.consider(vehicle, vehicle.position);
		});

		// 如果找到
		if (vehicleFinder.closestObject !== undefined)
		{
			// 拿到交通工具
			let vehicle = vehicleFinder.closestObject;
			// 得到进入交通工具的实例
			let vehicleEntryInstance = new VehicleEntryInstance(this);
			// 想要进入驾驶，或退出交通工具
			vehicleEntryInstance.wantsToDrive = wantsToDrive;

			// Find best seat
			let seatFinder = new ClosestObjectFinder<VehicleSeat>(this.position);
			for (const seat of vehicle.seats)
			{
				// 想驾驶
				if (wantsToDrive)
				{
					// Consider driver seats
					// 考虑驾驶座位
					if (seat.type === SeatType.Driver)
					{
						seat.seatPointObject.getWorldPosition(worldPos);
						seatFinder.consider(seat, worldPos);
					}
					// Consider passenger seats connected to driver seats
					// 考虑乘客座位和司机座位相连
					else if (seat.type === SeatType.Passenger)
					{
						for (const connSeat of seat.connectedSeats)
						{
							if (connSeat.type === SeatType.Driver)
							{
								seat.seatPointObject.getWorldPosition(worldPos);
								seatFinder.consider(seat, worldPos);
								break;
							}
						}
					}
				}
				// 不想驾驶
				else
				{
					// Consider passenger seats
					// 考虑乘客座位
					if (seat.type === SeatType.Passenger)
					{
						seat.seatPointObject.getWorldPosition(worldPos);
						seatFinder.consider(seat, worldPos);
					}
				}
			}

			// 寻找最近的座位
			if (seatFinder.closestObject !== undefined)
			{
				let targetSeat = seatFinder.closestObject;
				vehicleEntryInstance.targetSeat = targetSeat;

				let entryPointFinder = new ClosestObjectFinder<Object3D>(this.position);

				for (const point of targetSeat.entryPoints) {
					point.getWorldPosition(worldPos);
					entryPointFinder.consider(point, worldPos);
				}

				if (entryPointFinder.closestObject !== undefined)
				{
					vehicleEntryInstance.entryPoint = entryPointFinder.closestObject;
					this.triggerAction('up', true);
					this.vehicleEntryInstance = vehicleEntryInstance;
				}
			}
		}
	}

	/**
	 * 进入交通工具
	 * @param seat 座位
	 * @param entryPoint 进入点
	 */
	public enterVehicle(seat: VehicleSeat, entryPoint: THREE.Object3D): void
	{
		// 重置控制器
		this.resetControls();

		if (seat.door?.rotation < 0.5)
		{
			// 门没打开时，做执行开门动画
			this.setState(new OpenVehicleDoor(this, seat, entryPoint));
		}
		else
		{
			// 门打开后，执行进入交通工具
			this.setState(new EnteringVehicle(this, seat, entryPoint));
		}
	}

	public teleportToVehicle(vehicle: Vehicle, seat: VehicleSeat): void
	{
		this.resetVelocity();
		this.rotateModel();
		this.setPhysicsEnabled(false);
		(vehicle as unknown as THREE.Object3D).attach(this);

		this.setPosition(seat.seatPointObject.position.x, seat.seatPointObject.position.y + 0.6, seat.seatPointObject.position.z);
		this.quaternion.copy(seat.seatPointObject.quaternion);

		this.occupySeat(seat);
		this.setState(new Driving(this, seat));

		this.startControllingVehicle(vehicle, seat);
	}

	/**
	 * 开始控制交通工具
	 * @param vehicle 
	 * @param seat 
	 */
	public startControllingVehicle(vehicle: IControllable, seat: VehicleSeat): void
	{
		if (this.controlledObject !== vehicle)
		{
			// 迁移输入控制到交通工具上
			this.transferControls(vehicle);
			// 重置控制器
			this.resetControls();
	
			this.controlledObject = vehicle;
			this.controlledObject.allowSleep(false);
			// 交通工具按管输入控制
			vehicle.inputReceiverInit();
	
			vehicle.controllingCharacter = this;
		}
	}

	public inputReceiverMove(event: any, vector: any) {
		// 目标位置
		this.targetPosition.copy(vector);
		// 方向 = 目标位置 - 角色位置
		this.targetDirection = this.targetPosition.sub(this.position).normalize();

		// 设置往前走动作
		this.triggerAction('up', true);
		// 设置方向，false代表不是立马旋转到位，而是有旋转动画
		this.setOrientation(this.targetDirection, false);
	}

	public transferControls(entity: IControllable): void
	{
		// Currently running through all actions of this character and the vehicle,
		// comparing keycodes of actions and based on that triggering vehicle's actions
		// Maybe we should ask input manager what's the current state of the keyboard
		// and read those values... TODO
		for (const action1 in this.actions) {
			if (this.actions.hasOwnProperty(action1)) {
				for (const action2 in entity.actions) {
					if (entity.actions.hasOwnProperty(action2)) {

						let a1 = this.actions[action1];
						let a2 = entity.actions[action2];

						a1.eventCodes.forEach((code1) => {
							a2.eventCodes.forEach((code2) => {
								if (code1 === code2)
								{
									entity.triggerAction(action2, a1.isPressed);
								}
							});
						});
					}
				}
			}
		}
	}

	public stopControllingVehicle(): void
	{
		if (this.controlledObject?.controllingCharacter === this)
		{
			this.controlledObject.allowSleep(true);
			this.controlledObject.controllingCharacter = undefined;
			this.controlledObject.resetControls();
			this.controlledObject = undefined;
			this.inputReceiverInit();
		}
	}

	public exitVehicle(): void
	{
		if (this.occupyingSeat !== null)
		{
			if (this.occupyingSeat.vehicle.entityType === EntityType.Airplane)
			{
				this.setState(new ExitingAirplane(this, this.occupyingSeat));
			}
			else
			{
				this.setState(new ExitingVehicle(this, this.occupyingSeat));
			}
			
			this.stopControllingVehicle();
		}
	}

	public occupySeat(seat: VehicleSeat): void
	{
		this.occupyingSeat = seat;
		seat.occupiedBy = this;
	}

	public leaveSeat(): void
	{
		if (this.occupyingSeat !== null)
		{
			this.occupyingSeat.occupiedBy = null;
			this.occupyingSeat = null;
		}
	}

	/**
	 * 更新前预处理回调
	 * @param body 
	 * @param character 
	 */
	public physicsPreStep(body: CANNON.Body, character: Character): void
	{
		character.feetRaycast();

		// Raycast debug
		// 如果击中
		if (character.rayHasHit)
		{
			if (character.raycastBox.visible) {
				// 如果击中，把红色立方体设置在，击中点的位置
				character.raycastBox.position.x = character.rayResult.hitPointWorld.x;
				character.raycastBox.position.y = character.rayResult.hitPointWorld.y;
				character.raycastBox.position.z = character.rayResult.hitPointWorld.z;
			}
		}
		else
		{
			if (character.raycastBox.visible) {
				// 如果没有击中，把红色立方体设置在，离刚体y轴偏移这么多的位置
				character.raycastBox.position.set(body.position.x, body.position.y - character.rayCastLength - character.raySafeOffset, body.position.z);
			}
		}
	}

	/**
	 * 脚下的光线投射
	 */
	public feetRaycast(): void
	{
		// Player ray casting
		// Create ray
		let body = this.characterCapsule.body;
		const start = new CANNON.Vec3(body.position.x, body.position.y, body.position.z);
		const end = new CANNON.Vec3(body.position.x, body.position.y - this.rayCastLength - this.raySafeOffset, body.position.z);
		// Raycast options
		const rayCastOptions = {
			collisionFilterMask: CollisionGroups.Default,
			skipBackfaces: true      /* ignore back faces */
		};
		// Cast the ray
		// 是否击中物体
		this.rayHasHit = this.world.physicsWorld.raycastClosest(start, end, rayCastOptions, this.rayResult);
	}

	/**
	 * 更新后要做那些处理
	 * @param body 
	 * @param character 
	 */
	public physicsPostStep(body: CANNON.Body, character: Character): void
	{
		// Get velocities
		// 获取速度
		let simulatedVelocity = new THREE.Vector3(body.velocity.x, body.velocity.y, body.velocity.z);

		// Take local velocity
		// 获取局部速度
		let arcadeVelocity = new THREE.Vector3().copy(character.velocity).multiplyScalar(character.moveSpeed);
		// Turn local into global
		// 将局部速度转换为全局速度
		arcadeVelocity = Utils.appplyVectorMatrixXZ(character.orientation, arcadeVelocity);

		let newVelocity = new THREE.Vector3();

		// Additive velocity mode
		// 附加的速度模式
		if (character.arcadeVelocityIsAdditive)
		{
			newVelocity.copy(simulatedVelocity);

			let globalVelocityTarget = Utils.appplyVectorMatrixXZ(character.orientation, character.velocityTarget);
			let add = new THREE.Vector3().copy(arcadeVelocity).multiply(character.arcadeVelocityInfluence);

			if (Math.abs(simulatedVelocity.x) < Math.abs(globalVelocityTarget.x * character.moveSpeed) || Utils.haveDifferentSigns(simulatedVelocity.x, arcadeVelocity.x)) { newVelocity.x += add.x; }
			if (Math.abs(simulatedVelocity.y) < Math.abs(globalVelocityTarget.y * character.moveSpeed) || Utils.haveDifferentSigns(simulatedVelocity.y, arcadeVelocity.y)) { newVelocity.y += add.y; }
			if (Math.abs(simulatedVelocity.z) < Math.abs(globalVelocityTarget.z * character.moveSpeed) || Utils.haveDifferentSigns(simulatedVelocity.z, arcadeVelocity.z)) { newVelocity.z += add.z; }
		}
		else
		{
			newVelocity = new THREE.Vector3(
				THREE.MathUtils.lerp(simulatedVelocity.x, arcadeVelocity.x, character.arcadeVelocityInfluence.x),
				THREE.MathUtils.lerp(simulatedVelocity.y, arcadeVelocity.y, character.arcadeVelocityInfluence.y),
				THREE.MathUtils.lerp(simulatedVelocity.z, arcadeVelocity.z, character.arcadeVelocityInfluence.z),
			);
		}

		// If we're hitting the ground, stick to ground
		if (character.rayHasHit)
		{
			// Flatten velocity
			// 如果角色碰到地面，就贴着地面
			newVelocity.y = 0;

			// Move on top of moving objects
			// 在移动对象的顶部移动
			if (character.rayResult.body.mass > 0)
			{
				let pointVelocity = new CANNON.Vec3();
				character.rayResult.body.getVelocityAtWorldPoint(character.rayResult.hitPointWorld, pointVelocity);
				newVelocity.add(Utils.threeVector(pointVelocity));
			}

			// Measure the normal vector offset from direct "up" vector
			// and transform it into a matrix
			// 测量法线矢量与直接“向上”矢量的偏移量，并将其转换为矩阵
			let up = new THREE.Vector3(0, 1, 0);
			let normal = new THREE.Vector3(character.rayResult.hitNormalWorld.x, character.rayResult.hitNormalWorld.y, character.rayResult.hitNormalWorld.z);
			let q = new THREE.Quaternion().setFromUnitVectors(up, normal);
			let m = new THREE.Matrix4().makeRotationFromQuaternion(q);

			// Rotate the velocity vector
			newVelocity.applyMatrix4(m);

			// Compensate for gravity
			// 补偿重力
			// newVelocity.y -= body.world.physicsWorld.gravity.y / body.character.world.physicsFrameRate;

			// Apply velocity
			// 应用速度
			body.velocity.x = newVelocity.x;
			body.velocity.y = newVelocity.y;
			body.velocity.z = newVelocity.z;
			// Ground character
			body.position.y = character.rayResult.hitPointWorld.y + character.rayCastLength + (newVelocity.y / character.world.physicsFrameRate);
		}
		else
		{
			// If we're in air
			// 如果在空气中，用重力加速度
			body.velocity.x = newVelocity.x;
			body.velocity.y = newVelocity.y;
			body.velocity.z = newVelocity.z;

			// Save last in-air information
			character.groundImpactData.velocity.x = body.velocity.x;
			character.groundImpactData.velocity.y = body.velocity.y;
			character.groundImpactData.velocity.z = body.velocity.z;
		}

		// Jumping
		if (character.wantsToJump)
		{
			// If initJumpSpeed is set
			// 如果设置了初始的跳跃速度
			if (character.initJumpSpeed > -1)
			{
				// Flatten velocity
				body.velocity.y = 0;
				let speed = Math.max(character.velocitySimulator.position.length() * 4, character.initJumpSpeed);
				body.velocity = Utils.cannonVector(character.orientation.clone().multiplyScalar(speed));
			}
			else {
				// Moving objects compensation
				// 移动对象补偿
				let add = new CANNON.Vec3();
				character.rayResult.body.getVelocityAtWorldPoint(character.rayResult.hitPointWorld, add);
				body.velocity.vsub(add, body.velocity);
			}

			// Add positive vertical velocity 
			// 添加正垂直速度
			body.velocity.y += 4;
			// Move above ground by 2x safe offset value
			// 在地面上移动2倍安全偏移值
			body.position.y += character.raySafeOffset * 2;
			// Reset flag
			// 垂直想要跳跃标志
			character.wantsToJump = false;
		}
	}

	public addToWorld(world: World): void
	{
		if (_.includes(world.characters, this))
		{
			console.warn('Adding character to a world in which it already exists.');
		}
		else
		{
			// Set world
			this.world = world;

			// Register character
			world.characters.push(this);

			// Register physics
			world.physicsWorld.addBody(this.characterCapsule.body);

			// Add to graphicsWorld
			world.graphicsWorld.add(this);
			world.graphicsWorld.add(this.raycastBox);

			// Shadow cascades
			this.materials.forEach((mat) =>
			{
				world.sky.csm.setupMaterial(mat);
			});
		}
	}

	public removeFromWorld(world: World): void
	{
		if (!_.includes(world.characters, this))
		{
			console.warn('Removing character from a world in which it isn\'t present.');
		}
		else
		{
			if (world.inputManager.inputReceiver === this)
			{
				world.inputManager.inputReceiver = undefined;
			}

			this.world = undefined;

			// Remove from characters
			_.pull(world.characters, this);

			// Remove physics
			world.physicsWorld.remove(this.characterCapsule.body);

			// Remove visuals
			world.graphicsWorld.remove(this);
			world.graphicsWorld.remove(this.raycastBox);
		}
	}
}