<?php

$projectId = 'example-eshop.cz';

// Create a client instance
$wsdl = dirname(__FILE__) . '/ShipmallSoapAPI_v1.26.wsdl';
$soapOptions = [
    'location'           => 'https://elogist-demo.shipmall.cz/api/soap', // server url
    'soap_version'       => SOAP_1_2,
    'login'              => 'system@example-eshop.cz',
    'password'           => '2xc5d4sfa?wm4',
    'encoding'           => 'UTF-8',
    'trace'              => true, // umožní vypisovat obsah http požadavků pomocí metod __getLastRequest/Response
    'exceptions'         => true,
    'connection_timeout' => 120,
    'cache_wsdl'         => WSDL_CACHE_BOTH
];

$client = new SoapClient($wsdl, $soapOptions);

$method = 'DeliveryOrder';

// create a request structure
$param = new StdClass();

switch ($method) {
    case 'DeliveryOrder':
        $param->projectId = $projectId;
        $param->orderId = 130001;
        $param->orderDateTime = date('c', strtotime('2011-04-07 13:51'));
        $param->customerOrderId = 1234654613;
        $param->paymentId = 135468;
        $param->packingInstruction = 'Prosím opatrně při manipulaci';

        $param->sender = new StdClass();
        $param->sender->label = 'Můj název e-shopu';

        $address = new StdClass();
        $address->company = 'firma, s.r.o.';
        $address->street = 'U splavu 3';
        $address->city = 'Dobronice';
        $address->postcode = '123 00';
        $address->country = 'CZ';

        $param->recipient = new StdClass();
        $param->recipient->name = 'Josef Tester';
        $param->recipient->address = $address;
        $param->recipient->phone = '+420608077273';

        $param->shipping = new StdClass();
        $param->shipping->carrierId = 'GW';
        $param->shipping->service = 'Vnitrostátní přeprava';
        //$param->shipping->branchId = 'pha7';
        $param->shipping->cod = new StdClass();
        $param->shipping->cod->_ = 1299.0;
        $param->shipping->cod->currency = 'CZK';
        $param->shipping->attempts = 3;
        $param->shipping->comment = 'Doručit mezi 8-13';
        $param->shipping->sendAt = '2012-03-29';
        $param->shipping->option[0] = new StdClass();
        $param->shipping->option[0]->name = 'delivery_time_window';
        $param->shipping->option[0]->value = '12-14';
        $param->shipping->option[1] = new StdClass();
        $param->shipping->option[1]->name = 'evening_delivery';
        $param->shipping->option[1]->value = 'false';

        $param->shipping->insurance = new StdClass();
        $param->shipping->insurance->_ = 1299.0;
        $param->shipping->insurance->currency = 'CZK';

        $param->orderItems = new StdClass();
        $param->orderItems->orderItem[0] = new StdClass();
        $param->orderItems->orderItem[0]->productSheet = new StdClass();
        $param->orderItems->orderItem[0]->productSheet->productId = 231344;
        $param->orderItems->orderItem[0]->productSheet->barcode = '5-901234-123457';
        $param->orderItems->orderItem[0]->productSheet->productNumber = 'A00DD3561';
        $param->orderItems->orderItem[0]->productSheet->name = 'BDR-202';
        $param->orderItems->orderItem[0]->productSheet->description = 'Blu-ray/DVD/CD zapisovací mechanika';
        $param->orderItems->orderItem[0]->productSheet->vendor = 'Pioneer';
        $param->orderItems->orderItem[0]->productSheet->attributeSet->attribute[0] = 'barva';
        $param->orderItems->orderItem[0]->productSheet->attributeSet->attribute[1] = 'připojení';
        $param->orderItems->orderItem[0]->productSheet->quantityUnit = 'PC';
        $param->orderItems->orderItem[0]->variant[0] = new StdClass();
        $param->orderItems->orderItem[0]->variant[0]->attribute = 'barva';
        $param->orderItems->orderItem[0]->variant[0]->value = 'černá';
        $param->orderItems->orderItem[0]->variant[1] = new StdClass();
        $param->orderItems->orderItem[0]->variant[1]->attribute = 'připojení';
        $param->orderItems->orderItem[0]->variant[1]->value = 'SATA';
        $param->orderItems->orderItem[0]->quantity = 5;

        /*
        $param->documents = new StdClass();
        $param->documents->document[0] = new StdClass();
        $param->documents->document[0]->title = 'Faktura';
        $param->documents->document[0]->type = 'application/pdf';
        $param->documents->document[0]->content = new StdClass();
        $param->documents->document[0]->content->_ = file_get_contents('faktura1.pdf');
        $param->documents->document[0]->content->md5checksum = md5_file('faktura1.pdf');
        */

        break;

    case 'DeliveryOrderStatusGet':
        $param->projectId = $projectId;
        $param->orderId = 130000;
        break;

    case 'DeliveryOrderStatusGetNews':
        //  $param->projectId = $projectId;
        $param->afterDateTime = date('c', strtotime('2012-04-12'));
        break;

    case 'DeliveryOrderHistoryGet':
        $param->projectId = $projectId;
        $param->orderId = 130000;
        break;

    case 'DeliveryOrderStatusSet':
        $param->projectId = $projectId;
        $param->orderId = 130000;
        $param->status = 'CANCELLED';
        break;

    case 'StockInventoryGet':
        $param->filter = new StdClass();
        $param->filter->product[0] = new StdClass();
        $param->filter->product[0]->productId = 1922;
        break;

    case 'StockInventoryGetNews':
        $param->afterDateTime = date('c', strtotime(2011 - 03 - 30));
        break;

    case 'InventoryChangesGet':
        $param->afterDateTime = date('c', strtotime('2012-01-27 10:00'));
        break;

    case 'StorageOrder':
        $param->orderId = 1801;
        $param->supplier = 'AAA Computer';
        $param->deliveryDate = '2012-02-26';

        $param->orderItems = new StdClass();
        $param->orderItems->orderItem[0] = new StdClass();
        $param->orderItems->orderItem[0]->productSheet = new StdClass();
        $param->orderItems->orderItem[0]->productSheet->productId = 231343;
        $param->orderItems->orderItem[0]->productSheet->barcode = '5-901234-123457';
        $param->orderItems->orderItem[0]->productSheet->productNumber = 'A00DD3561';
        $param->orderItems->orderItem[0]->productSheet->name = 'BDR-202';
        $param->orderItems->orderItem[0]->productSheet->description = 'Blu-ray/DVD/CD zapisovací mechanika';
        $param->orderItems->orderItem[0]->productSheet->vendor = 'Pioneer';
        $param->orderItems->orderItem[0]->productSheet->attributeSet->attribute[0] = 'barva';
        $param->orderItems->orderItem[0]->productSheet->attributeSet->attribute[1] = 'připojení';
        $param->orderItems->orderItem[0]->productSheet->quantityUnit = 'PC';
        $param->orderItems->orderItem[0]->variant[0] = new StdClass();
        $param->orderItems->orderItem[0]->variant[0]->attribute = 'barva';
        $param->orderItems->orderItem[0]->variant[0]->value = 'černá';
        $param->orderItems->orderItem[0]->variant[1] = new StdClass();
        $param->orderItems->orderItem[0]->variant[1]->attribute = 'připojení';
        $param->orderItems->orderItem[0]->variant[1]->value = 'SATA';
        $param->orderItems->orderItem[0]->quantity = 5;

        $param->orderItems->orderItem[1] = new StdClass();
        $param->orderItems->orderItem[1]->productSheet = new StdClass();
        $param->orderItems->orderItem[1]->productSheet->productId = 455435;
        $param->orderItems->orderItem[1]->productSheet->name = 'UTP kabel cat.5';
        $param->orderItems->orderItem[1]->productSheet->description = 'Nestíněný síťový kabel';
        $param->orderItems->orderItem[1]->productSheet->vendor = 'OEM';
        $param->orderItems->orderItem[1]->productSheet->quantityUnit = 'METER';
        $param->orderItems->orderItem[1]->quantity = 25;
        break;

    case 'StorageOrderStatusGet':
        $param->orderId = 1801;
        break;

    case 'StorageOrderStatusGetNews':
        $param->afterDateTime = date('c', strtotime('2011-03-29'));
        break;

    case 'StorageOrderHistoryGet':
        $param->orderId = 1801;
        break;

    case 'StorageOrderStatusSet':
        $param->orderId = 1801;
        $param->status = 'CANCELLED';
        break;

    case 'PaymentListGet':
        $param->afterDate = '2012-01-01';
        break;

    case 'PaymentDetailGet':
        $param->account = '85-123456/0300';
        $param->paymentId = 20;
        break;

    case 'ProductUpdate':
        $param->productId = 231344;
        $param->barcode = '5-901234-123457';
        $param->productNumber = 'A00DD3561';
        $param->name = 'BDR-202';
        $param->description = 'Blu-ray/DVD/CD zapisovací mechanika';
        $param->vendor = 'Pioneer';
        $param->attributeSet->attribute[0] = 'barva';
        $param->attributeSet->attribute[1] = 'připojení';
        $param->quantityUnit = 'PC';
        break;

    case 'BranchListGet':
        $param->carrierId = 'ZASILKOVNA';
        break;
}

// METHOD CALL
try {
    $r = $client->$method($param);

    // RESULT TREATMENT...
    var_dump($r);
} catch (SoapFault $e) {
    // error reporting
    printf("ERROR (%s): %s\n", $e->faultcode, $e->faultstring);
} catch (Exception $e) {
    // error reporting
    echo $e->getMessage();
}

echo 'REQUEST: ' . $client->__getLastRequestHeaders() . $client->__getLastRequest() . PHP_EOL;
echo 'RESPONSE: ' . $client->__getLastResponseHeaders() . $client->__getLastResponse() . PHP_EOL;
