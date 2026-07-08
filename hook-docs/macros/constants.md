# Constants defined in `macro.h`

The header also defines a set of plain integer constants used as arguments to the
transaction-flag, keylet, and field APIs.

## `tfCANONICAL`

```c
#define tfCANONICAL 0x80000000UL
```

The canonical-signature transaction flag. Set it in the `sfFlags` field of a
transaction you build for [`emit`](../api-reference/emit/emit.md) when the emitted
transaction needs the canonical flag.

## Account-type selectors (`at*`)

```c
atACCOUNT=1, atOWNER=2, atDESTINATION=3, atISSUER=4, atAUTHORIZE=5,
atUNAUTHORIZE=6, atTARGET=7, atREGULARKEY=8, atPSEUDOCALLBACK=9
```

Small integer tags identifying *which* account role you mean. They select an account
field when building keylets or reading structured objects. Use the value that matches
the role you need (e.g. `atDESTINATION` for a payment destination).

## Amount-type selectors (`am*`)

```c
amAMOUNT=1, amBALANCE=2, amLIMITAMOUNT=3, amTAKERPAYS=4, amTAKERGETS=5,
amLOWLIMIT=6, amHIGHLIMIT=7, amFEE=8, amSENDMAX=9, amDELIVERMIN=10,
amMINIMUMOFFER=16, amRIPPLEESCROW=17, amDELIVEREDAMOUNT=18
```

Tags identifying *which* amount field of an object you mean (the offer's `TakerPays`
vs. `TakerGets`, a trustline's low/high limit, and so on). As with the `at*` set, pass
the tag matching the field you are after.

> These `at*`/`am*` values are selector tags, not the full `(type<<16)|index` `sf*`
> field codes in `hook/sfcodes.h`. Do not pass an `sf*` code where an `at*`/`am*` tag is
> expected, or vice versa.
