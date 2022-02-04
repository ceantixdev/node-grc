
export interface PromiseData<T> {
	resolve(val: T | PromiseLike<T>): void
	reject(reason?: any): void
}

export class PromiseManger {
	private promiseData: {[uri: string]: PromiseData<any>} = {};
	
	createPromise<Type>(uri: string): Promise<Type> {
        return new Promise<Type>((resolve, reject) => {
            this.promiseData[uri] = {
                resolve: resolve,
                reject: reject
            };
        });
    }

    resolvePromise<Type>(uri: string, data: Type): void {
        if (uri in this.promiseData) {
            this.promiseData[uri].resolve(data);
            delete this.promiseData[uri];
        }
    }

    rejectPromise<Type>(uri: string, data: Type): void {
        if (uri in this.promiseData) {
            this.promiseData[uri].reject(data);
            delete this.promiseData[uri];
        }
    }
}
