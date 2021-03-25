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
    const QUAD_TRIANGLES = [0, 1, 2, 2, 3, 0];
    const VERTEX_SIZE = 2 + 2 + 4;
    const shareVertices = Utils.newFloatArray(8 * 1024);
    export class SkeletonRenderer extends egret.DisplayObjectContainer {
        public skeleton: Skeleton;
        public skeletonData: SkeletonData;
        private skeletonDataPromise: Promise<SkeletonData>;
        public state: AnimationState;
        public stateData: AnimationStateData;
        public slotRenderers: SlotRenderer[] = [];

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
                let renderer = new SlotRenderer(slot);

                renderer.name = slot.data.name;
                this.slotRenderers.push(renderer);
                this.addChild(renderer);
                renderer.renderSlot();
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
            for (let i = 0; i < drawOrder.length; i++) {
                let slot = drawOrder[i].data.index;
                this.setChildIndex(this.slotRenderers[slot], i);
            }
            for (let renderer of this.slotRenderers) {
                renderer.renderSlot();
            }
            clipper.clipEnd();
        }
    }

    const tempColor = new Color();
    function getRegionTexture(region: TextureAtlasRegion) {
        let sheet = (region.texture as AdapterTexture).spriteSheet;
        return sheet.$texture
    }
    const enum AttachmentType {
        None,
        Region,
        Mesh,
        Clip,
    }
    export class SlotRenderer extends egret.Mesh {
        private attachment: Attachment;
        private attachmentType = AttachmentType.None;
        private uvs: number[];
        private vertices: number[];
        private indices: number[];

        public constructor(readonly slot: Slot) {
            super();
            let meshNode = this.$renderNode as egret.sys.MeshNode;
            this.uvs = meshNode.uvs;
            this.vertices = meshNode.vertices;
            this.indices = meshNode.indices;
        }

        resetAttachment(attachment: Attachment) {
            if (attachment == this.attachment) {
                return;
            }
            this.attachment = attachment;
            let attachmentType = AttachmentType.None;
            this.visible = false;
            if (attachment instanceof RegionAttachment) {
                attachmentType = AttachmentType.Region;
                this.visible = true;
            } else if (attachment instanceof MeshAttachment) {
                attachmentType = AttachmentType.Mesh;
                this.visible = true;
            } else if (attachment instanceof ClippingAttachment) {
                attachmentType = AttachmentType.Clip;
            }
            this.attachmentType = attachmentType;
        }

        public renderSlot() {
            let slot = this.slot;
            let attachment = slot.getAttachment();
            this.resetAttachment(attachment);
            let texture: egret.Texture = null;

            let numFloats = 0;

            if (slot.data.blendMode == BlendMode.Additive) {
                this.blendMode = egret.BlendMode.ADD;
            } else {
                this.blendMode = egret.BlendMode.NORMAL;
            }

            let vertices: ArrayLike<number> = shareVertices;
            let triangles: Array<number> = null;
            let uvs: ArrayLike<number>;

            let attachmentColor: Color;
            let vertexSize = clipper.isClipping() ? 2 : VERTEX_SIZE;
            if (this.attachmentType == AttachmentType.Region) {
                let region = <RegionAttachment>attachment;
                region.computeWorldVertices(slot.bone, vertices, 0, vertexSize);
                triangles = QUAD_TRIANGLES;
                attachmentColor = region.color;
                uvs = region.uvs;
                numFloats = vertexSize * 4;
                texture = getRegionTexture(region.region as TextureAtlasRegion)
            } else if (this.attachmentType == AttachmentType.Mesh) {
                let mesh = <MeshAttachment>attachment;
                mesh.computeWorldVertices(slot, 0, mesh.worldVerticesLength, vertices, 0, vertexSize);
                triangles = mesh.triangles;
                attachmentColor = mesh.color;
                uvs = mesh.uvs;
                numFloats = (mesh.worldVerticesLength >> 1) * vertexSize;
                texture = getRegionTexture(mesh.region as TextureAtlasRegion)
            } else if (this.attachmentType == AttachmentType.Clip) {
                clipper.clipStart(slot, attachment as ClippingAttachment);
                return;
            }

            if (texture != null) {
                //准备开始渲染
                let skeleton = slot.bone.skeleton;
                let skeletonColor = skeleton.color;
                let slotColor = slot.color;

                let alpha = skeletonColor.a * slotColor.a * attachmentColor.a;
                let color = tempColor;
                color.set(skeletonColor.r * slotColor.r * attachmentColor.r,
                    skeletonColor.g * slotColor.g * attachmentColor.g,
                    skeletonColor.b * slotColor.b * attachmentColor.b,
                    alpha);

                let finalVerticesLength = numFloats
                let finalIndicesLength = triangles.length
                let finalIndices = triangles
                let finalVertices = vertices
                let isClipping = clipper.isClipping();
                if (isClipping) {
                    clipper.clipTriangles(vertices, numFloats, triangles, triangles.length, uvs, Color.WHITE, Color.WHITE, false);
                    finalVerticesLength = clipper.clippedVertices.length
                    finalIndicesLength = clipper.clippedTriangles.length
                    finalIndices = clipper.clippedTriangles
                    finalVertices = clipper.clippedVertices
                } else {
                    this.uvs.length = uvs.length;
                    for (let i = 0; i < uvs.length; ++i) {
                        this.uvs[i] = uvs[i];
                    }
                }

                this.vertices.length = finalVerticesLength / VERTEX_SIZE * 2;
                if (isClipping) {
                    this.uvs.length = this.vertices.length;
                }
                let index = 0;
                for (let j = 0; j < finalVerticesLength; j += VERTEX_SIZE, index += 2) {
                    this.vertices[index] = finalVertices[j];
                    this.vertices[index + 1] = finalVertices[j + 1];
                    if (isClipping) {
                        this.uvs[index] = finalVertices[j + 6];
                        this.uvs[index + 1] = finalVertices[j + 7];
                    }
                }
                this.indices.length = finalIndicesLength;
                for (let j = 0; j < finalIndicesLength; j++) {
                    this.indices[j] = finalIndices[j];
                }

                this.drawMesh(texture, color)
            }

            clipper.clipEndWithSlot(slot);
        }

        private drawMesh(texture: egret.Texture, color: Color) {
            const meshNode = this.$renderNode as egret.sys.MeshNode;

            meshNode.image = texture.bitmapData;

            meshNode.drawMesh(
                texture.$bitmapX, texture.$bitmapY,
                texture.$bitmapWidth, texture.$bitmapHeight,
                texture.$offsetX, texture.$offsetY,
                texture.textureWidth, texture.textureHeight
            );
            meshNode.imageWidth = texture.$sourceWidth;
            meshNode.imageHeight = texture.$sourceHeight;

            this.texture = texture

            this.tint = (color.r * 255 << 16) | (color.g * 255 << 8) | (color.b * 255);
            this.alpha = color.a;

            this.$updateVertices();
        }
    }
}
