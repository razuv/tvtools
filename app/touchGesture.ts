export class TouchGesture {
  private readonly pointers=new Set<number>();
  private blocked=false;
  start(id:number){this.pointers.add(id);if(this.pointers.size>1)this.blocked=true;return this.canDrag(id);}
  canDrag(id:number){return !this.blocked&&this.pointers.size===1&&this.pointers.has(id);}
  end(id:number){this.pointers.delete(id);if(!this.pointers.size)this.blocked=false;}
}
