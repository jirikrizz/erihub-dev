<?php

namespace Modules\Pim\Exceptions;

class MissingAttributeMappingException extends \RuntimeException
{
    public function __construct(
        string $message,
        private readonly array $details = [],
        int $code = 0,
        ?\Throwable $previous = null
    ) {
        parent::__construct($message, $code, $previous);
    }

    public function getDetails(): array
    {
        return $this->details;
    }
}
