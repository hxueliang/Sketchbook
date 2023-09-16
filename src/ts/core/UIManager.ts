/**
 * UI界面管理
 */
export class UIManager
{
	// 显示用户控制面板
	public static setUserInterfaceVisible(value: boolean): void
	{
		document.getElementById('ui-container').style.display = value ? 'block' : 'none';
	}

	// 显示加载页面
	public static setLoadingScreenVisible(value: boolean): void
	{
		document.getElementById('loading-screen').style.display = value ? 'flex' : 'none';
	}

	// 显示fps
	public static setFPSVisible(value: boolean): void
	{
		document.getElementById('statsBox').style.display = value ? 'block' : 'none';
		document.getElementById('dat-gui-container').style.top = value ? '48px' : '0px';
	}
}