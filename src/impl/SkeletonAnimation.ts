namespace spine {
    export class SkeletonAnimation extends egret.DisplayObjectContainer {
        public renderer: SkeletonRenderer;
        public get state() {
            return this.renderer.state;
        }
        public get stateData() {
            return this.renderer.stateData;
        }
        public get skeleton() {
            return this.renderer.skeleton;
        }
        public get skeletonData() {
            return this.renderer.skeletonData;
        }
        private lastTime: number = 0;

        public constructor(skeletonData: SkeletonData | Promise<SkeletonData>) {
            super();
            this.renderer = new SkeletonRenderer(skeletonData);
            this.addChild(this.renderer);
            this.addEventListener(egret.Event.ADDED_TO_STAGE, this.onAddedToStage, this);
        }

        public loadEnsure() {
            return this.renderer.loadEnsure().then(() => this);
        }

        public loaded() {
            return this.renderer.skeleton != null;
        }

        public get flipX(): boolean {
            return this.renderer.scaleX == -1;
        }

        public set flipX(flip: boolean) {
            this.renderer.scaleX = flip ? -1 : 1;
        }

        public get flipY(): boolean {
            return this.renderer.scaleY == 1;
        }

        public set flipY(flip: boolean) {
            this.renderer.scaleY = flip ? 1 : -1;
        }

        public setTimeScale(scale: number) {
            this.state.timeScale = scale;
        }

        public getTimeScale() {
            return this.state.timeScale;
        }

        public play(anim: string, loop = 0, trackID = 0, listener?: AnimationListener): Track {
            return this.start(trackID).add(anim, loop, listener);
        }

        public start(trackID = 0): Track {
            if (this.skeleton) {
                this.skeleton.setToSetupPose();
            } else {
                this.loadEnsure().then(() => {
                    this.skeleton.setToSetupPose();
                });
            }
            return new Track(this, trackID);
        }

        public stop(track: number) {
            this.state.clearTrack(track);
        }

        public stopAll(reset?: boolean) {
            this.state.clearTracks();
            if (reset) this.skeleton.setToSetupPose();
        }

        private onAddedToStage() {
            this.lastTime = Date.now() / 1000;
            this.addEventListener(egret.Event.ENTER_FRAME, this.onEnterFrame, this);
            this.addEventListener(egret.Event.REMOVED_FROM_STAGE, this.onRemovedFromStage, this);
        }

        private onRemovedFromStage() {
            this.removeEventListener(egret.Event.ENTER_FRAME, this.onEnterFrame, this);
            this.removeEventListener(egret.Event.REMOVED_FROM_STAGE, this.onRemovedFromStage, this);
        }

        private onEnterFrame() {
            let now = Date.now() / 1000;
            this.renderer.update(now - this.lastTime);
            this.lastTime = now;
        }

        public setMix(anim1: string, anim2: string, duration: number) {
            //TODO:not impl yet
        }

        public setGLProgramState(state) {
            //TODO:not impl yet
        }
    }
}
