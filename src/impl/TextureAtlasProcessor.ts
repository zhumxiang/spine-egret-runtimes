namespace spine {
    //add by zmx: load the images when finishing loading atlas
    class AtlasProcessor implements RES.processor.Processor {
        onLoadStart(host: RES.ProcessHost, resource: RES.ResourceInfo): Promise<any> {
            return RES.processor.TextProcessor.onLoadStart(host, resource).then((text: string) => {
                let images = [] as string[];
                let lines = text.split(/\r\n|\r|\n/);
                let firstLine = true;
                for (let line of lines) {
                    line = line.trim();
                    if (line.length == 0) {
                        firstLine = true;
                    } else if (firstLine) {
                        firstLine = false;
                        images.push(line);
                    }
                }
                let tasks = images.map(image => {
                    let r = host.resourceConfig.getResource(RES.nameSelector(image));
                    if (!r) {
                        r = { name: image, url: image, type: 'image', root: resource.root };
                    }
                    return host.load(r).then((tex: egret.Texture) => {
                        tex.bitmapData.$deleteSource = false;
                        host.save(r, tex);
                    }, e => {
                        host.remove(r);
                        throw e;
                    });
                });
                return Promise.all(tasks).then(() => text);
            });
        }
        onRemoveStart(host: RES.ProcessHost, resource: RES.ResourceInfo): void {

        }
    }
    RES.processor.map("atlas", new AtlasProcessor());
}