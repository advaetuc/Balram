import { z } from "zod";

export const SQUARE_METRES_PER_ACRE = 4046.8564224;
export const GUNTHAS_PER_ACRE = 40;
export const SQUARE_METRES_PER_GUNTHA = SQUARE_METRES_PER_ACRE / GUNTHAS_PER_ACRE;
export interface AcresAndGunthas { acres:number; gunthas:number; totalGunthas:number; totalAcres:number; areaSquareMetres:number }
export function squareMetresToGunthas(value:number):number { return z.number().finite().nonnegative().parse(value)/SQUARE_METRES_PER_GUNTHA; }
export function gunthasToSquareMetres(value:number):number { return z.number().finite().nonnegative().parse(value)*SQUARE_METRES_PER_GUNTHA; }
export function acresAndGunthasToGunthas(acres:number,gunthas:number):number {
 const a=z.number().finite().nonnegative().parse(acres), g=z.number().finite().nonnegative().parse(gunthas);
 if(a*GUNTHAS_PER_ACRE+g<=0) throw new RangeError("Land area must be greater than zero."); return a*GUNTHAS_PER_ACRE+g;
}
export function gunthasToAcresAndGunthas(value:number):AcresAndGunthas {
 const totalGunthas=z.number().finite().nonnegative().parse(value);
 let tenths=Math.round(totalGunthas*10), acres=Math.floor(tenths/400), remainingTenths=tenths-acres*400;
 if(remainingTenths>=400){acres++;remainingTenths-=400;}
 const gunthas=remainingTenths/10, roundedTotal=acres*40+gunthas;
 return {acres,gunthas,totalGunthas:roundedTotal,totalAcres:roundedTotal/40,areaSquareMetres:gunthasToSquareMetres(roundedTotal)};
}
export function squareMetresToAcresAndGunthas(value:number):AcresAndGunthas { return gunthasToAcresAndGunthas(squareMetresToGunthas(value)); }
