export enum ServerCategory {
	classic = 0,
	gold = 1,
	hosted = 2,
	hidden = 3,
	g3d = 4
}

export interface ServerEntry {
	name: string
	category: ServerCategory
	language: string
	description: string
	url: string
	version: string
	pcount: number
	ip: string
	port: number
}

export type ServerlistConfig = {
	host: string
	port: number
	account: string
	password: string,
	nickname: string
};

export interface RCEvents {
	onRCConnected?(instance: RCInterface): void
	onRCDisconnected?(instance: RCInterface, text?: string): void
	onRCChat?(text: string): void

	onReceiveFolderConfig?(text: string): void
	onReceiveServerFlags?(text: string): void
	onReceiveServerOptions?(text: string): void
}

export interface RCInterface {
	sendRCChat(text: string): void
	setNickName(name: string): void

	requestFolderConfig(): void
	requestServerFlags(): void
	requestServerOptions(): void

	setFolderConfig(text: string): void
	setServerFlags(text: string): void
	setServerOptions(text: string): void
}


export interface NCEvents {
	onNCConnected?(): void
	onNCDisconnected?(text?: string): void
	onNCChat?(text: string): void

	onReceiveLevelList?(levelList: string): void

	onReceiveClassScript?(name: string, script: string): void

	onReceiveNpcAttributes?(name: string, text: string): void;
	onReceiveNpcFlags?(name: string, flags: string): void
	onReceiveNpcScript?(name: string, script: string): void

	onReceiveWeaponList?(weapons: string[]): void
	onReceiveWeaponScript?(name: string, image: string, script: string): void
}

export interface NCInterface {
	requestLevelList(): void
	updateLevelList(text: string): void

	deleteWeapon(name: string): void
	requestWeaponList(): void
	requestWeapon(name: string): void
	setWeaponScript(name: string, image: string, script: string): void

	deleteNpc(name: string): void
	requestNpcAttributes(name: string): void
	requestNpcFlags(name: string): void
	requestNpcScript(name: string): void
	setNpcFlags(name: string, script: string): void
	setNpcScript(name: string, script: string): void

	deleteClass(name: string): void
	requestClass(name: string): void
	setClassScript(name: string, script: string): void
}