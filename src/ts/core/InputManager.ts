import * as THREE from 'three';
import { World } from '../world/World';
import { IInputReceiver } from '../interfaces/IInputReceiver';
import { EntityType } from '../enums/EntityType';
import { IUpdatable } from '../interfaces/IUpdatable';

export class InputManager implements IUpdatable
{
	public updateOrder: number = 3;

	public world: World;
	public domElement: any;
	public pointerLock: any;
	public isLocked: boolean;
	public inputReceiver: IInputReceiver; // 输入操作的接收者
	public mouse: THREE.Vector2;
	public raycaster: THREE.Raycaster;
	public clock: THREE.Clock;


	// 定义函数
	public boundOnMouseDown: (evt: any) => void;
	public boundOnMouseMove: (evt: any) => void;
	public boundOnMouseUp: (evt: any) => void;
	public boundOnMouseWheelMove: (evt: any) => void;
	public boundOnDblclick: (evt: any) => void;
	public boundOnTouchstart: (evt: any) => void;
	public boundOnPointerlockChange: (evt: any) => void;
	public boundOnPointerlockError: (evt: any) => void;
	public boundOnKeyDown: (evt: any) => void;
	public boundOnKeyUp: (evt: any) => void;
	
	/**
	 * 输入管理
	 * @param world - 当前世界(当前世界里有：图像世界和物理世界)
	 * @param domElement - canvas画布，各种操作都是在画布中进行，可以做事件监听
	 */
	constructor(world: World, domElement: HTMLElement)
	{
		this.world = world;
		this.pointerLock = world.params.Pointer_Lock;
		this.domElement = domElement || document.body;
		this.isLocked = false;
		this.clock = new THREE.Clock();
		
		// 创建函数
		// Bindings for later event use
		// Mouse
		this.boundOnMouseDown = (evt) => this.onMouseDown(evt);
		this.boundOnMouseMove = (evt) => this.onMouseMove(evt);
		this.boundOnMouseUp = (evt) => this.onMouseUp(evt);
		this.boundOnMouseWheelMove = (evt) => this.onMouseWheelMove(evt);
		this.boundOnDblclick = (evt) => this.onDblclick(evt);
		this.boundOnTouchstart = (evt) => this.onTouchstart(evt);

		// Pointer lock
		this.boundOnPointerlockChange = (evt) => this.onPointerlockChange(evt);
		this.boundOnPointerlockError = (evt) => this.onPointerlockError(evt);

		// Keys
		this.boundOnKeyDown = (evt) => this.onKeyDown(evt);
		this.boundOnKeyUp = (evt) => this.onKeyUp(evt);

		this.mouse = new THREE.Vector2();
		this.raycaster = new THREE.Raycaster();

		// 初始化事件监听器
		// Init event listeners
		// Mouse
		this.domElement.addEventListener('mousedown', this.boundOnMouseDown, false);
		document.addEventListener('wheel', this.boundOnMouseWheelMove, false);
		document.addEventListener('pointerlockchange', this.boundOnPointerlockChange, false);
		document.addEventListener('pointerlockerror', this.boundOnPointerlockError, false);
		document.addEventListener('dblclick', this.boundOnDblclick, false);
		document.addEventListener('touchstart', this.boundOnTouchstart, false);
		
		// Keys
		document.addEventListener('keydown', this.boundOnKeyDown, false);
		document.addEventListener('keyup', this.boundOnKeyUp, false);

		// 将需要更新的对象，在注册表里注册
		world.registerUpdatable(this);
	}

	public update(timestep: number, unscaledTimeStep: number): void
	{
		if (this.inputReceiver === undefined && this.world !== undefined && this.world.cameraOperator !== undefined)
		{
			this.setInputReceiver(this.world.cameraOperator);
		}

		this.inputReceiver?.inputReceiverUpdate(unscaledTimeStep);
	}

	/**
	 * 设置输入的接收者
	 * @param receiver 接收者
	 */
	public setInputReceiver(receiver: IInputReceiver): void
	{
		this.inputReceiver = receiver;
		this.inputReceiver.inputReceiverInit();
	}

	public setPointerLock(enabled: boolean): void
	{
		this.pointerLock = enabled;
	}

	public onPointerlockChange(event: MouseEvent): void
	{
		if (document.pointerLockElement === this.domElement)
		{
			this.domElement.addEventListener('mousemove', this.boundOnMouseMove, false);
			this.domElement.addEventListener('mouseup', this.boundOnMouseUp, false);
			this.isLocked = true;
		}
		else
		{
			this.domElement.removeEventListener('mousemove', this.boundOnMouseMove, false);
			this.domElement.removeEventListener('mouseup', this.boundOnMouseUp, false);
			this.isLocked = false;
		}
	}

	public onPointerlockError(event: MouseEvent): void
	{
		console.error('PointerLockControls: Unable to use Pointer Lock API');
	}

	public onDblclick(event: MouseEvent): void {
		if(this.world.mobile) {
			this.inputReceiver.triggerAction('up', false);
		}
	}

	public onTouchstart(event: any): void {
		const time = this.clock.getDelta();
		if(time < 0.2) {
			this.onDblclick(event);
			return;
		}
		if(this.world.mobile) {
			// 获取鼠标点击的位置
			const {clientX: x, clientY: y} = event.touches[0];
			// 将屏幕坐标转为标准的设备坐标
			this.mouse.x = (x / window.innerWidth) * 2 - 1;
			this.mouse.y = -(y / window.innerHeight) * 2 + 1;
			// 设置射线的起点和方向
			this.raycaster.setFromCamera(this.mouse, this.world.camera);
			// 计算射线和物体的交点
			const intersects = this.raycaster.intersectObjects(this.world.graphicsWorld.children, true);
			// 如果有交点
			if(intersects.length > 0) {
				// 控制输入的接收者(角色)，移动到交点
				this.inputReceiver?.inputReceiverMove(event, intersects[0].point);
			}
			return;
		}
	}

	public onMouseDown(event: MouseEvent): void
	{
		if(this.world.mobile) {
			return
		}
		if (this.pointerLock)
		{
			this.domElement.requestPointerLock();
		}
		else
		{
			this.domElement.addEventListener('mousemove', this.boundOnMouseMove, false);
			this.domElement.addEventListener('mouseup', this.boundOnMouseUp, false);
		}

		if (this.inputReceiver !== undefined)
		{
			this.inputReceiver.handleMouseButton(event, 'mouse' + event.button, true);
		}
	}

	public onMouseMove(event: MouseEvent): void
	{
		if (this.inputReceiver !== undefined)
		{
			this.inputReceiver.handleMouseMove(event, event.movementX, event.movementY);
		}
	}

	public onMouseUp(event: MouseEvent): void
	{
		if (!this.pointerLock)
		{
			this.domElement.removeEventListener('mousemove', this.boundOnMouseMove, false);
			this.domElement.removeEventListener('mouseup', this.boundOnMouseUp, false);
		}

		if (this.inputReceiver !== undefined)
		{
			this.inputReceiver.handleMouseButton(event, 'mouse' + event.button, false);
		}
	}

	/**
	 * 键盘按下事件
	 * @param event 
	 */
	public onKeyDown(event: KeyboardEvent): void
	{
		if (this.inputReceiver !== undefined)
		{
			// true为按下
			this.inputReceiver.handleKeyboardEvent(event, event.code, true);
		}
	}

	/**
	 * 键盘抬起事件
	 * @param event 
	 */
	public onKeyUp(event: KeyboardEvent): void
	{
		if (this.inputReceiver !== undefined)
		{
			// false为按下
			this.inputReceiver.handleKeyboardEvent(event, event.code, false);
		}
	}

	public onMouseWheelMove(event: WheelEvent): void
	{
		if (this.inputReceiver !== undefined)
		{
			this.inputReceiver.handleMouseWheel(event, event.deltaY);
		}
	}
}