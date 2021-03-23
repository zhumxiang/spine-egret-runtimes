namespace spine {
    export interface Attachment {
        color?: { r: number, g: number, b: number, a: number };
    }
    class AdapterTexture extends Texture {
        public readonly spriteSheet: egret.SpriteSheet;

        public constructor(bitmapData: egret.BitmapData) {
            super(bitmapData.source);
            let texture = new egret.Texture();
            texture.bitmapData = bitmapData;
            this.spriteSheet = new egret.SpriteSheet(texture);
        }

        /** NIY */
        setFilters(minFilter: TextureFilter, magFilter: TextureFilter): void { }
        setWraps(uWrap: TextureWrap, vWrap: TextureWrap): void { }
        dispose(): void { }
    }

    export function createSkeletonDataWithJson(jsonData: string | {}, atlas: TextureAtlas) {
        let json = new SkeletonJson(new AtlasAttachmentLoader(atlas));
        return json.readSkeletonData(jsonData);
    }

    export function createSkeletonDataWithBinary(binaryData: Uint8Array, atlas: TextureAtlas) {
        let bin = new SkeletonBinary(new AtlasAttachmentLoader(atlas));
        return bin.readSkeletonData(binaryData);
    }

    export function createTextureAtlas(atlasData: string, textures?: Record<string, egret.Texture>) {
        return new TextureAtlas(atlasData, (file: string) => {
            let texture = textures ? textures[file] : RES.getRes(file.replace(".", "_")) as egret.Texture;
            return new AdapterTexture(texture && texture.bitmapData);
        });
    }
    const clipper = new SkeletonClipping();
    export class SkeletonRenderer extends egret.DisplayObjectContainer {
        public skeleton: Skeleton;
        public skeletonData: SkeletonData;
        private skeletonDataPromise: Promise<SkeletonData>;
        public state: AnimationState;
        public stateData: AnimationStateData;
        public slotRenderers: SlotRenderer[] = [];

        static vertices = Utils.newFloatArray(8 * 1024);
        static QUAD_TRIANGLES = [0, 1, 2, 2, 3, 0];
        static VERTEX_SIZE = 2 + 2 + 4;

        public constructor(skeletonData: SkeletonData | Promise<SkeletonData>) {
            super();
            if (skeletonData instanceof SkeletonData) {
                this.skeletonData = skeletonData;
                this.init();
            } else {
                this.skeletonDataPromise = skeletonData;
                this.skeletonDataPromise.then(data => {
                    this.skeletonData = data;
                    this.init();
                });
            }
            this.stateData = new AnimationStateData(skeletonData);
            this.state = new AnimationState(this.stateData);
            this.touchEnabled = true;
            this.scaleY = -1;
        }

        private init() {
            this.skeleton = new Skeleton(this.skeletonData);
            this.skeleton.updateWorldTransform();

            for (let slot of this.skeleton.slots) {
                let renderer = new SlotRenderer();

                renderer.name = slot.data.name;
                this.slotRenderers.push(renderer);
                this.addChild(renderer);
                renderer.renderSlot(slot);
            }
            clipper.clipEnd();
        }

        public loadEnsure() {
            if (this.skeletonData) {
                return Promise.resolve(this);
            } else {
                return this.skeletonDataPromise.then(() => this);
            }
        }

        public findSlotRenderer(name: string): SlotRenderer {
            return this.getChildByName(name) as SlotRenderer;
        }

        public update(dt: number) {
            if (!this.skeletonData) {
                return;
            }
            this.state.update(dt);
            this.state.apply(this.skeleton);
            this.skeleton.updateWorldTransform();

            let drawOrder = this.skeleton.drawOrder;
            let slots = this.skeleton.slots;

            for (let i = 0; i < drawOrder.length; i++) {
                let slot = drawOrder[i].data.index;
                this.setChildIndex(this.slotRenderers[slot], i);
            }
            for (let i = 0; i < slots.length; i++) {
                let renderer = this.slotRenderers[i];

                renderer.renderSlot(slots[i]);
            }
            clipper.clipEnd();
        }
    }

    export class SlotRenderer extends egret.DisplayObjectContainer {
        public colored: boolean = false;
        private currentMesh: egret.DisplayObject;
        private tempColor = new Color();

        public constructor() {
            super();
            this.currentMesh = new egret.Mesh()
            this.addChild(this.currentMesh)
        }

        public getRegionTexture(region: TextureAtlasRegion) {
            let sheet = (region.texture as AdapterTexture).spriteSheet;
            return sheet.$texture
        }

        public renderSlot(slot: Slot) {
            let attachment = slot.getAttachment();
            let texture: egret.Texture = null;
            let region: TextureAtlasRegion = null;

            let numFloats = 0;

            if (slot.data.blendMode == BlendMode.Additive) {
                this.blendMode = egret.BlendMode.ADD;
            } else {
                this.blendMode = egret.BlendMode.NORMAL;
            }

            let vertices: ArrayLike<number> = SkeletonRenderer.vertices;
            let triangles: Array<number> = null;
            let uvs: ArrayLike<number>;

            let attachmentColor = new Color()
            let vertexSize = clipper.isClipping() ? 2 : SkeletonRenderer.VERTEX_SIZE;
            if (attachment instanceof RegionAttachment) {
                this.visible = true;
                let regionAttachment = <RegionAttachment>attachment;
                regionAttachment.computeWorldVertices(slot.bone, vertices, 0, vertexSize);
                triangles = SkeletonRenderer.QUAD_TRIANGLES;
                region = <TextureAtlasRegion>regionAttachment.region;
                attachmentColor = attachment.color;
                uvs = attachment.uvs;
                numFloats = vertexSize * 4;
                texture = this.getRegionTexture(attachment.region as TextureAtlasRegion)

            } else if (attachment instanceof MeshAttachment) {
                this.visible = true;
                let mesh = <MeshAttachment>attachment;
                mesh.computeWorldVertices(slot, 0, mesh.worldVerticesLength, vertices, 0, vertexSize);
                triangles = mesh.triangles;
                region = <TextureAtlasRegion>mesh.region;
                attachmentColor = attachment.color;
                uvs = attachment.uvs;
                numFloats = (mesh.worldVerticesLength >> 1) * vertexSize;
                texture = this.getRegionTexture(attachment.region as TextureAtlasRegion)
            } else if (attachment instanceof ClippingAttachment) {
                clipper.clipStart(slot, attachment);
                return;
            } else {
                this.visible = false;
            }

            if (texture != null) {
                //准备开始渲染
                let skeleton = slot.bone.skeleton;
                let skeletonColor = skeleton.color;
                let slotColor = slot.color;

                let alpha = skeletonColor.a * slotColor.a * attachmentColor.a;
                let color = this.tempColor;
                color.set(skeletonColor.r * slotColor.r * attachmentColor.r,
                    skeletonColor.g * slotColor.g * attachmentColor.g,
                    skeletonColor.b * slotColor.b * attachmentColor.b,
                    alpha);

                let npos = []
                let nuvs = [];
                let nindices = []
                let j = 0;

                let finalVerticesLength = numFloats
                let finalIndicesLength = triangles.length
                let finalIndices = triangles
                let finalVertices = vertices
                if (clipper.isClipping()) {
                    clipper.clipTriangles(vertices, numFloats, triangles, triangles.length, uvs, Color.WHITE, Color.WHITE, false);
                    finalVerticesLength = clipper.clippedVertices.length
                    finalIndicesLength = clipper.clippedTriangles.length
                    finalIndices = clipper.clippedTriangles
                    finalVertices = clipper.clippedVertices
                } else {
                    for (let i = 0; i < uvs.length; ++i) {
                        nuvs[i] = uvs[i];
                    }
                }

                for (; j < finalVerticesLength;) {
                    npos.push(finalVertices[j++]);
                    npos.push(finalVertices[j++]);
                    j += 4;
                    if (finalVertices == vertices) {
                        j += 2;
                    } else {
                        nuvs.push(finalVertices[j++]);
                        nuvs.push(finalVertices[j++]);
                    }
                }
                for (j = 0; j < finalIndicesLength; j++) {
                    nindices.push(finalIndices[j])
                }

                this.drawMesh(texture, nuvs, npos, nindices, color)
            }

            clipper.clipEndWithSlot(slot);
        }

        private drawMesh(texture: egret.Texture, uvs: number[], vertices: number[], indices: number[], color: Color) {
            let meshObj = this.currentMesh as egret.Mesh
            const meshNode = meshObj.$renderNode as egret.sys.MeshNode;
            meshNode.uvs = uvs
            meshNode.vertices = vertices
            meshNode.indices = indices

            meshNode.image = texture.bitmapData;

            meshNode.drawMesh(
                texture.$bitmapX, texture.$bitmapY,
                texture.$bitmapWidth, texture.$bitmapHeight,
                texture.$offsetX, texture.$offsetY,
                texture.textureWidth, texture.textureHeight
            );
            meshNode.imageWidth = texture.$sourceWidth;
            meshNode.imageHeight = texture.$sourceHeight;

            meshObj.texture = texture

            meshObj.tint = (color.r * 255 << 16) | (color.g * 255 << 8) | (color.b * 255);
            meshObj.alpha = color.a;

            meshObj.$updateVertices();
        }
    }
}
