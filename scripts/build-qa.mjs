import { build, Platform, Arch } from 'electron-builder';
await build({targets:Platform.WINDOWS.createTarget(['nsis'],Arch.x64),publish:'never',config:{
 appId:'com.universe1234.quanlai.qa',productName:'QuanLai QA',
 directories:{output:'release-qa'},
 nsis:{shortcutName:'QuanLai QA'},
}});
