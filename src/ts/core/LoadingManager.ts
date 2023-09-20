/**
 * 加载管理器
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { LoadingTrackerEntry } from './LoadingTrackerEntry';
import { UIManager } from './UIManager';
import { Scenario } from '../world/Scenario';
import Swal from 'sweetalert2';
import { World } from '../world/World';

export class LoadingManager
{
	public firstLoad: boolean = true;
	public onFinishedCallback: () => void;
	
	private world: World;
	private gltfLoader: GLTFLoader;
	private loadingTracker: LoadingTrackerEntry[] = [];

	constructor(world: World)
	{
		this.world = world;
		this.gltfLoader = new GLTFLoader();

		// 时间因子，控制速度
		this.world.setTimeScale(0);
		// UI界面管理
		UIManager.setUserInterfaceVisible(false);
		UIManager.setLoadingScreenVisible(true);
	}

	public loadGLTF(path: string, onLoadingFinished: (gltf: any) => void): void
	{
		// 添加到加载跟踪器
		let trackerEntry = this.addLoadingEntry(path);

		this.gltfLoader.load(path,
		(gltf)  =>
		{
			onLoadingFinished(gltf);
			this.doneLoading(trackerEntry);
		},
		(xhr) =>
		{
			if ( xhr.lengthComputable )
			{
				trackerEntry.progress = xhr.loaded / xhr.total;
			}
		},
		(error)  =>
		{
			console.error(error);
		});
	}

	public addLoadingEntry(path: string): LoadingTrackerEntry
	{
		let entry = new LoadingTrackerEntry(path);
		this.loadingTracker.push(entry);

		return entry;
	}

	public doneLoading(trackerEntry: LoadingTrackerEntry): void
	{
		// 追踪对象状态改为已完成
		trackerEntry.finished = true;
		// 追踪对象进度改为1
		trackerEntry.progress = 1;

		// 完成
		if (this.isLoadingDone())
		{
			if (this.onFinishedCallback !== undefined) 
			{
				// 加载完成的回调函数
				this.onFinishedCallback();
			}
			else
			{
				UIManager.setUserInterfaceVisible(true);
				if(this.world.mobile) {
					UIManager.setUserInterfaceVisible(false);
				}
			}

			UIManager.setLoadingScreenVisible(false);
		}
	}

	public createWelcomeScreenCallback(scenario: Scenario): void
	{
		if (this.onFinishedCallback === undefined)
		{
			this.onFinishedCallback = () =>
			{
				this.world.update(1, 1);
	
				Swal.fire({
					title: scenario.descriptionTitle,
					html: scenario.descriptionContent,
					confirmButtonText: 'Play',
					buttonsStyling: false,
					onClose: () => {
						this.world.setTimeScale(1);
						UIManager.setUserInterfaceVisible(true);

						if(this.world.mobile) {
							UIManager.setUserInterfaceVisible(false);
						}
					}
				});
			};
		}
	}

	private getLoadingPercentage(): number
	{
		let done = true;
		let total = 0;
		let finished = 0;

		for (const item of this.loadingTracker)
		{
			total++;
			finished += item.progress;
			if (!item.finished) done = false;
		}

		return (finished / total) * 100;
	}

	private isLoadingDone(): boolean
	{
		for (const entry of this.loadingTracker) {
			if (!entry.finished) return false;
		}
		return true;
	}
}