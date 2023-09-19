import { ISpawnPoint } from '../interfaces/ISpawnPoint';
import { VehicleSpawnPoint } from './VehicleSpawnPoint';
import { CharacterSpawnPoint } from './CharacterSpawnPoint';
import { World } from '../world/World';
import { LoadingManager } from '../core/LoadingManager';
import { LuckyTrigger } from '../trigger/LuckyTrigger';

export class Scenario
{
	public id: string;
	public name: string;
	public spawnAlways: boolean = false;
	public default: boolean = false;
	public world: World;
	public descriptionTitle: string;
	public descriptionContent: string;
	
	private rootNode: THREE.Object3D;
	private spawnPoints: ISpawnPoint[] = [];
	private invisible: boolean = false;
	private initialCameraAngle: number;

	constructor(root: THREE.Object3D, world: World)
	{
		this.rootNode = root;
		this.world = world;
		this.id = root.name;

		// Scenario
		// 把blender的自定义属性解释到对应场景的对象上
		// 设置场景名字
		if (root.userData.hasOwnProperty('name')) 
		{
			this.name = root.userData.name;
		}
		// 读取blender配置的初始化场景
		if (root.userData.hasOwnProperty('default') && root.userData.default === 'true') 
		{
			this.default = true;
		}
		// 读取重生场景
		if (root.userData.hasOwnProperty('spawn_always') && root.userData.spawn_always === 'true') 
		{
			this.spawnAlways = true;
		}
		// 是否不可见
		if (root.userData.hasOwnProperty('invisible') && root.userData.invisible === 'true') 
		{
			this.invisible = true;
		}
		// 有无标题
		if (root.userData.hasOwnProperty('desc_title')) 
		{
			this.descriptionTitle = root.userData.desc_title;
		}
		// 描述内容
		if (root.userData.hasOwnProperty('desc_content')) 
		{
			this.descriptionContent = root.userData.desc_content;
		}
		// 相机角度
		if (root.userData.hasOwnProperty('camera_angle')) 
		{
			this.initialCameraAngle = root.userData.camera_angle;
		}

		// 没有设置 不可见为true，即场景可见的，创建启动函数
		if (!this.invisible) this.createLaunchLink();

		// Find all scenario spawns and enitites
		// 找到所有的场景生成和实体
		root.traverse((child) => {
			if (child.hasOwnProperty('userData') && child.userData.hasOwnProperty('data'))
			{
				// data是否为重生
				if (child.userData.data === 'spawn')
				{
					// 如果是 小车 飞机 直升机
					if (child.userData.type === 'car' || child.userData.type === 'airplane' || child.userData.type === 'heli')
					{
						// 创建交通工具重生点
						let sp = new VehicleSpawnPoint(child);

						if (child.userData.hasOwnProperty('type')) 
						{
							// 设置类型
							sp.type = child.userData.type;
						}

						if (child.userData.hasOwnProperty('driver')) 
						{
							// 设置驾驶员
							sp.driver = child.userData.driver;

							if (child.userData.driver === 'ai' && child.userData.hasOwnProperty('first_node'))
							{
								// 设置第一个节点
								sp.firstAINode = child.userData.first_node;
							}
						}

						this.spawnPoints.push(sp);
					}
					else if (child.userData.type === 'player')
					{
						// 如果有玩家，把角色也重生
						let sp = new CharacterSpawnPoint(child);
						this.spawnPoints.push(sp);
					}
				}
				else if(child.userData.data === 'trigger')
				{
					if(child.userData.type === 'lucky')
					{
						const luckyTrigger = new LuckyTrigger(child, world);
					}
				}
			}
		});
	}

	public createLaunchLink(): void
	{
		// 在世界对象的params里，设置一个与当前场景同名的方法，下次就能可以通过姓名来启动场景
		this.world.params[this.name] = () =>
		{
			this.world.launchScenario(this.id);
		};
		// 并且往用户界面中添加一项
		this.world.scenarioGUIFolder.add(this.world.params, this.name);
	}

	/**
	 * 场景加载
	 * @param loadingManager 加载管理器
	 * @param world 世界对象
	 */
	public launch(loadingManager: LoadingManager, world: World): void
	{
		// console.log('launch',this.name);
		// console.log(this.spawnPoints);
		this.spawnPoints.forEach((sp) => {
			sp.spawn(loadingManager, world);
		});

		if (!this.spawnAlways)
		{
			// 如果这个场景是不会总是重生，那么每次加载进来就会显示欢迎界面
			loadingManager.createWelcomeScreenCallback(this);

			world.cameraOperator.theta = this.initialCameraAngle;
			world.cameraOperator.phi = 15;
		}
	}
}