namespace spine {
    //并非真正的es2015Map，只是为了适配spine代码，K仅限string|number
    class ES2015Map<K, V> {
        private _innerMap = {}
        get(key: K) {
            return this._innerMap[key as any] as V;
        }
        set(key: K, value: V) {
            this._innerMap[key as any] = value;
        }
        delete(key: K) {
            delete this._innerMap[key as any];
        }
        clear() {
            for(let key in this._innerMap){
                this.delete(key as any);
            }
        }
    }
    export const Map = ES2015Map;
}