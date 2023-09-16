/**
 * 当前加载文件的情况
 */
export class LoadingTrackerEntry
{
	public path: string;
	public progress: number = 0;
	public finished: boolean = false;

	constructor(path: string)
	{
		this.path = path;
	}
}